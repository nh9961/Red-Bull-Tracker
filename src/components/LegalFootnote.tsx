const TERMS_SUMMARY =
  "By using track.9961.one you agree to use the tracker responsibly, keep your login secure, and accept that intake data is stored in your Appwrite account under your control. This applies only to track.9961.one.";

const PRIVACY_SUMMARY =
  "track.9961.one stores intake logs and preferences in Appwrite, tied to your account. Coach chats can be encrypted client-side before upload. We do not sell your data. This policy applies only to track.9961.one.";

type LegalFootnoteProps = {
  className?: string;
};

export function LegalFootnote({ className = "" }: LegalFootnoteProps) {
  return (
    <footer className={`legal-footnote ${className}`.trim()} aria-label="Legal notices for track.9961.one">
      <span className="legal-footnote-site">track.9961.one</span>
      <span className="legal-footnote-links">
        <span className="legal-tooltip-wrap">
          <button className="legal-tooltip-trigger" type="button" aria-describedby="legal-terms-tip">
            Terms
          </button>
          <span className="legal-tooltip" id="legal-terms-tip" role="tooltip">
            {TERMS_SUMMARY}
          </span>
        </span>
        <span className="legal-tooltip-wrap">
          <button className="legal-tooltip-trigger" type="button" aria-describedby="legal-privacy-tip">
            Privacy
          </button>
          <span className="legal-tooltip" id="legal-privacy-tip" role="tooltip">
            {PRIVACY_SUMMARY}
          </span>
        </span>
      </span>
    </footer>
  );
}
