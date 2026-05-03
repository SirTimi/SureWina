import { Shield, Hash, ExternalLink } from 'lucide-react';
import { Card } from '@surewina/ui';

export function TrustPanel() {
  return (
    <Card variant="default" className="p-6">
      <div className="flex items-center gap-2 mb-5">
        <Shield className="w-4 h-4 text-navy-800" />
        <h2 className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
          Why you can trust this draw
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div>
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-navy-800 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm text-ink-950 mb-1">
                Regulated under Nigerian lottery law
              </h3>
              <p className="text-xs text-ink-500 leading-relaxed">
                Operated under licence from the National Lottery Regulatory Commission (NLRC).
                Licence <span className="font-mono">#NL/2025/0241</span>.
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-start gap-3">
            <Hash className="w-5 h-5 text-navy-800 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm text-ink-950 mb-1">
                Audited draws with public RNG seed hashes
              </h3>
              <p className="text-xs text-ink-500 leading-relaxed">
                Every draw publishes a SHA-256 seed hash before it runs. After the draw, the seed
                is revealed so anyone can verify.
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-start gap-3">
            <ExternalLink className="w-5 h-5 text-navy-800 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm text-ink-950 mb-1">
                Public results archive
              </h3>
              <p className="text-xs text-ink-500 leading-relaxed">
                Every winner, every draw, every reference number — kept on the public record
                forever, not buried in a feed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}