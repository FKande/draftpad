import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act, useState } from 'react'
import { createServer } from 'vite'

let dom, document, window, server, createRoot, NoteEditor, root
let requests

const initialNotes = {
  a: { id: 'a', title: 'Alpha', content: 'Original A' },
  b: { id: 'b', title: 'Beta', content: 'Original B' },
}

function EditorHarness({ id }) {
  const [notes, setNotes] = useState(initialNotes)
  const change = (field, value) => setNotes(current => ({
    ...current, [id]: { ...current[id], [field]: value },
  }))
  // Match NoteEditorRoute's actual keyed lifecycle on sidebar navigation.
  return React.createElement(NoteEditor, {
    key: id,
    note: notes[id],
    onContentChange: value => change('content', value),
    onTitleChange: value => change('title', value),
    onDirtyChange() {},
  })
}

async function openNote(id) {
  await act(() => root.render(React.createElement(React.StrictMode, null,
    React.createElement(EditorHarness, { id }),
  )))
}

async function type(field, value) {
  const element = document.querySelector(field === 'content' ? 'textarea' : 'input')
  const prototype = field === 'content' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  await act(() => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
    element.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

async function blur() {
  await act(() => window.dispatchEvent(new window.Event('blur')))
}

async function unmount() {
  if (!root) return
  await act(() => root.unmount())
  root = null
}

async function finish(request, fail = false) {
  await act(async () => {
    request.settled = true
    if (fail) request.reject(new Error('Simulated save failure'))
    else request.resolve({ ...initialNotes[request.id], ...request.fields })
    await Promise.resolve()
  })
}

async function finishAll() {
  for (let round = 0; round < 20; round++) {
    const pending = requests.find(request => !request.settled)
    if (!pending) return
    await finish(pending)
  }
  assert.fail('Save queue did not drain')
}

function savedFields(id) {
  return Object.assign({}, ...requests.filter(request => request.id === id).map(request => request.fields))
}

before(async () => {
  dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  window = dom.window
  document = window.document
  globalThis.window = window
  globalThis.document = document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // Initialize ReactDOM after the DOM so its input-event support is detected.
  ;({ createRoot } = await import('react-dom/client'))
  server = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    plugins: [{
      name: 'autosave-test-dependencies',
      enforce: 'pre',
      resolveId(source, importer) {
        if (!importer?.replaceAll('\\', '/').endsWith('/src/NoteEditor.tsx')) return
        if (source === './api') return '\0autosave-api'
        if (source === './NoteAttachments') return '\0autosave-attachments'
      },
      load(id) {
        if (id === '\0autosave-api') return 'export const updateNote = (...args) => globalThis.__autosaveTestRequest(...args)'
        if (id === '\0autosave-attachments') return 'export default function Attachments() { return null }'
      },
    }],
  })
  ;({ default: NoteEditor } = await server.ssrLoadModule('/src/NoteEditor.tsx'))
})

beforeEach(async () => {
  requests = []
  globalThis.__autosaveTestRequest = (id, fields) => new Promise((resolve, reject) => {
    requests.push({ id, fields, resolve, reject, settled: false })
  })
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById('root'))
  await openNote('a')
})

afterEach(async () => {
  await unmount()
  await finishAll()
})

after(async () => {
  await server?.close()
  dom?.window.close()
  delete globalThis.__autosaveTestRequest
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
  delete globalThis.window
  delete globalThis.document
})

test('navigation before 500ms flushes the latest title and content to the old note', async () => {
  await type('content', 'First edit')
  await type('content', 'Final characters')
  await type('title', 'Final title')
  assert.equal(requests.length, 0)
  await openNote('b')
  await finishAll()
  assert.deepEqual(savedFields('a'), { content: 'Final characters', title: 'Final title' })
  assert.deepEqual(savedFields('b'), {})
  assert.equal(document.querySelector('textarea').value, 'Original B')
})

test('unmount without selecting another note also flushes', async () => {
  await type('content', 'Last edit before leaving')
  await unmount()
  await finishAll()
  assert.deepEqual(savedFields('a'), { content: 'Last edit before leaving' })
})

test('clean StrictMode mount and unmount do not save', async () => {
  await unmount()
  assert.equal(requests.length, 0)
})

test('blur uses the latest values and unmount does not duplicate the pending save', async () => {
  await type('content', 'First edit')
  await type('content', 'Latest edit')
  await blur()
  await blur()
  await unmount()
  await finishAll()
  assert.deepEqual(requests.map(({ fields }) => fields), [{ content: 'Latest edit' }])
})

test('normal debounce still saves after 500ms and a later unmount does not repeat it', async () => {
  await type('content', 'Debounced edit')
  assert.equal(requests.length, 0)
  await act(() => new Promise(resolve => setTimeout(resolve, 550)))
  assert.equal(requests.length, 1)
  await finishAll()
  await unmount()
  assert.equal(requests.length, 1)
})

test('a debounce firing during a blur save does not send a duplicate request', async () => {
  await type('content', 'Already being saved')
  await blur()
  await act(() => new Promise(resolve => setTimeout(resolve, 550)))
  await unmount()
  await finishAll()
  assert.deepEqual(requests.map(({ fields }) => fields), [{ content: 'Already being saved' }])
})

test('newer edits flush after an older in-flight save, even after unmount', async () => {
  await type('content', 'Older edit')
  await blur()
  await type('content', 'Newer edit')
  await openNote('b')
  assert.equal(requests.length, 1, 'newer write must wait for the older one')
  await finishAll()
  assert.deepEqual(requests.map(({ fields }) => fields), [{ content: 'Older edit' }, { content: 'Newer edit' }])
})

test('reverting to the original value during a save still persists the revert', async () => {
  await type('content', 'Temporary edit')
  await blur()
  await type('content', 'Original A')
  await unmount()
  await finishAll()
  assert.deepEqual(requests.map(({ fields }) => fields), [{ content: 'Temporary edit' }, { content: 'Original A' }])
})

test('failed older save does not block the final flush or change the next editor UI', async () => {
  await type('title', 'Older title')
  await blur()
  await type('title', 'Final title')
  await openNote('b')
  await finish(requests[0], true)
  await finishAll()
  assert.equal(requests.at(-1).fields.title, 'Final title')
  assert.doesNotMatch(document.body.textContent, /Couldn't save/)
})

test('a final request failing after unmount is handled without affecting the next note', async () => {
  await type('content', 'Last edit')
  await openNote('b')
  assert.equal(requests.length, 1)
  await finish(requests[0], true)
  assert.equal(document.querySelector('textarea').value, 'Original B')
  assert.doesNotMatch(document.body.textContent, /Couldn't save/)
})

test('returning to the same note keeps its writes ordered across editor instances', async () => {
  await type('content', 'First instance')
  await blur()
  await openNote('b')
  await openNote('a')
  await type('content', 'Second instance')
  await blur()
  assert.equal(requests.length, 1, 'same-note writes share ordering across unmounts')
  await finishAll()
  assert.deepEqual(requests.map(({ fields }) => fields), [{ content: 'First instance' }, { content: 'Second instance' }])
})
