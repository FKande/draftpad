import { z } from 'zod'
import type { Request, Response, NextFunction } from 'express'


const uuidSchema = z.string().uuid()

export function validateUuidParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction) => {

    const result = uuidSchema.safeParse(req.params[paramName])

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    next()
  }
}
