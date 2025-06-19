import {z} from "zod";

export const createSchema = z.object({
    name: z.string().min(3).max(50),
    email: z.string().email(),
    age: z.number().int().positive().optional(),
});