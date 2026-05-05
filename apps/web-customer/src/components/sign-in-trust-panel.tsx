import { Badge } from '@surewina/ui';

export function SignInTrustPanel() {
  return (
    <div className="max-w-md">
      <Badge variant="jackpot" className="mb-6">
        🛡 NLRC Licence #NL/2025/0241
      </Badge>

      <h2 className="font-display text-3xl sm:text-4xl font-bold leading-tight">
        Real prizes. Verifiable draws.<br />
        No app required.
      </h2>

      <ul className="space-y-5 mt-8">
        <li className="flex gap-3">
          <span className="text-amber-500 font-bold mt-0.5">✓</span>
          <div>
            <p className="font-semibold text-base">SHA-256 seed hash committed before every draw</p>
            <p className="text-sm text-white/60 mt-0.5">
              Verifiable on-chain after the fact
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="text-amber-500 font-bold mt-0.5">✓</span>
          <div>
            <p className="font-semibold text-base">Audited by Deloitte West Africa</p>
            <p className="text-sm text-white/60 mt-0.5">Quarterly public audit reports</p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="text-amber-500 font-bold mt-0.5">✓</span>
          <div>
            <p className="font-semibold text-base">Pays out within 24 hours</p>
            <p className="text-sm text-white/60 mt-0.5">Direct to your verified bank account</p>
          </div>
        </li>
      </ul>
    </div>
  );
}