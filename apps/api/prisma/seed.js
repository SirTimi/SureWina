"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    const email = process.env.ADMIN_SEED_EMAIL?.toLowerCase().trim() || 'admin@surewina.local';
    const password = process.env.ADMIN_SEED_PASSWORD || 'AdminPass123!';
    const fullName = process.env.ADMIN_SEED_FULL_NAME || 'Surewina Admin';
    if (password.length < 12) {
        throw new Error('ADMIN_SEED_PASSWORD must be at least 12 characters.');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await prisma.adminUser.upsert({
        where: {
            email,
        },
        create: {
            email,
            fullName,
            passwordHash,
            role: client_1.AdminRole.OPERATOR,
            isActive: true,
            mfaEnabled: false,
            failedAttempts: 0,
            lockedUntil: null,
        },
        update: {
            fullName,
            passwordHash,
            role: client_1.AdminRole.OPERATOR,
            isActive: true,
            mfaEnabled: false,
            failedAttempts: 0,
            lockedUntil: null,
        },
    });
    console.log(`Seeded admin user: ${admin.email}`);
}
main()
    .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map