import { Shield, Hash, Lock, ExternalLink } from 'lucide-react';
import { Card } from '@surewina/ui';

interface HowDrawWorksProps {
  seedHash?: string;
  seedCommittedAt?: string;
}

export function HowDrawWorks({ seedHash, seedCommittedAt }: HowDrawWorksProps) {
  return (
    <Card variant="default" className="p-6">
      <div className="flex items-center gap-2 mb-5">
        <Shield className="w-4 h-4 text-navy-800" />
        <h2 className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
          How this draw works
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-navy-800 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm text-ink-950 mb-1">Licensed under NLRC</h3>
            <p className="text-xs text-ink-500 leading-relaxed">
              National Lottery Regulatory Commission, Licence{' '}
              <span className="font-mono">#NL/2025/0241</span>. Your ticket is a legally
              registered raffle entry.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Hash className="w-5 h-5 text-navy-800 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm text-ink-950 mb-1">RNG seed published before draw</h3>
            <p className="text-xs text-ink-500 leading-relaxed">
              The SHA-256 hash of the seed is committed at midnight. Drawn live at 20:00 WAT,
              then the seed is revealed for verification.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 text-navy-800 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm text-ink-950 mb-1">Tickets sold count is signed</h3>
            <p className="text-xs text-ink-500 leading-relaxed">
              The live counter is signed every 30 seconds by our auditor. Tampering breaks the
              chain — you&apos;d see it in the archive.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <ExternalLink className="w-5 h-5 text-navy-800 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm text-ink-950 mb-1">Result is permanent + public</h3>
            <p className="text-xs text-ink-500 leading-relaxed">
              Winning ticket reference is published to surewina.ng/results within 60 seconds of
              the draw closing. Forever.
            </p>
          </div>
        </div>
      </div>

      {seedHash && (
        <div className="mt-6 pt-5 border-t border-ink-100">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
                <Hash className="w-3 h-3 inline mr-1" />
                Tonight&apos;s seed hash{' '}
                {seedCommittedAt && (
                  <span className="text-ink-300 font-normal">
                    · committed {seedCommittedAt}
                  </span>
                )}
              </p>
              <p className="font-mono text-xs text-ink-700 break-all">{seedHash}</p>
            </div>
            <a
              href="#"
              className="text-sm text-navy-800 hover:text-navy-700 font-medium inline-flex items-center gap-1 flex-shrink-0"
            >
              Verify <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </Card>
  );
}