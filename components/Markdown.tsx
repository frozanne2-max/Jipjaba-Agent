import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Compact markdown renderer tuned for chat bubbles (Toss-style).
 * Supports GFM: tables, lists, bold/italic, links, code, blockquotes.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[14.5px] leading-relaxed text-ink [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
        components={{
          p: ({ children }) => <p className="my-2">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-bold text-ink">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-brand underline underline-offset-2 hover:text-brand-600"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => (
            <h1 className="mb-2 mt-3 text-[16px] font-extrabold text-ink">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1.5 mt-3 text-[15px] font-bold text-ink">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2.5 text-[14.5px] font-bold text-ink-soft">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-5 marker:text-ink-faint">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-ink-muted">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-brand-300 bg-brand-50/50 py-1 pl-3 pr-2 text-ink-soft">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-line" />,
          code: ({ children, className }) => {
            const isBlock = (className || "").includes("language-");
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-xl bg-ink px-3 py-2 font-mono text-[12.5px] text-white">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[12.5px] text-brand-700">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="my-2">{children}</pre>,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse overflow-hidden rounded-xl border border-line text-[13px]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
          th: ({ children }) => (
            <th className="border border-line px-2.5 py-1.5 text-left font-bold text-ink-soft">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-line px-2.5 py-1.5 align-top text-ink-soft">
              {children}
            </td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
