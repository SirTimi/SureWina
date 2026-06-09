-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NONE', 'OTP_VERIFIED', 'TIER1_COMPLETE');

-- CreateEnum
CREATE TYPE "SpendPeriod" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "AgentTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('PENDING_KYC', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OPERATOR', 'COMPLIANCE_OFFICER', 'FINANCE_OFFICER', 'SUPPORT_AGENT');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('CUSTOMER', 'AGENT', 'ADMIN', 'ENGINE', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "email" TEXT,
    "display_name" TEXT,
    "kyc_status" "KycStatus" NOT NULL DEFAULT 'NONE',
    "loyalty_points_balance" INTEGER NOT NULL DEFAULT 0,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "spend_limit_period" "SpendPeriod",
    "spend_limit_cap_ngn" INTEGER,
    "self_exclusion_until" TIMESTAMP(3),
    "bank_code" TEXT,
    "bank_account_last4" TEXT,
    "bank_account_name_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "agents" (
    "agent_id" TEXT NOT NULL,
    "agent_code" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "email" TEXT,
    "full_name" TEXT NOT NULL,
    "registered_state_code" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'PENDING_KYC',
    "tier" "AgentTier" NOT NULL DEFAULT 'BRONZE',
    "commission_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "is_super_agent" BOOLEAN NOT NULL DEFAULT false,
    "super_agent_code" TEXT,
    "override_commission_rate" DECIMAL(5,4),
    "bvn_hash" TEXT NOT NULL,
    "training_completed_at" TIMESTAMP(3),
    "agent_agreement_signed_at" TIMESTAMP(3),
    "monthly_ticket_count" INTEGER NOT NULL DEFAULT 0,
    "grace_period_used_at" TIMESTAMP(3),
    "bank_code" TEXT,
    "bank_account_last4" TEXT,
    "bank_account_name_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("agent_id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "admin_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "mfa_secret" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("admin_user_id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "log_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" "AuditSeverity" NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "signature" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_number_idx" ON "users"("phone_number");

-- CreateIndex
CREATE INDEX "users_self_exclusion_until_idx" ON "users"("self_exclusion_until");

-- CreateIndex
CREATE UNIQUE INDEX "agents_agent_code_key" ON "agents"("agent_code");

-- CreateIndex
CREATE UNIQUE INDEX "agents_phone_number_key" ON "agents"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "agents_email_key" ON "agents"("email");

-- CreateIndex
CREATE INDEX "agents_agent_code_idx" ON "agents"("agent_code");

-- CreateIndex
CREATE INDEX "agents_status_tier_idx" ON "agents"("status", "tier");

-- CreateIndex
CREATE INDEX "agents_super_agent_code_idx" ON "agents"("super_agent_code");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "audit_log_timestamp_idx" ON "audit_log"("timestamp");

-- CreateIndex
CREATE INDEX "audit_log_actor_type_actor_id_idx" ON "audit_log"("actor_type", "actor_id");

-- CreateIndex
CREATE INDEX "audit_log_resource_type_resource_id_idx" ON "audit_log"("resource_type", "resource_id");
