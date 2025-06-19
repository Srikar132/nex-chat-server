"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSchema = void 0;
const zod_1 = require("zod");
exports.createSchema = zod_1.z.object({
    name: zod_1.z.string().min(3).max(50),
    email: zod_1.z.string().email(),
    age: zod_1.z.number().int().positive().optional(),
});
