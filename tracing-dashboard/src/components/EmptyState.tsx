import { Inbox, Terminal, ExternalLink } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  showQuickStart?: boolean;
  className?: string;
}

const SDK_SNIPPET = `import os
os.environ["TRACING_ENDPOINT"] = "http://localhost:9200"
os.environ["TRACING_PROJECT"] = "my-project"
import tracing_sdk
tracing_sdk.init()`;

export function EmptyState({
  icon,
  title,
  description,
  showQuickStart = false,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`bento text-center py-12 ${className}`}>
      <div className="text-gray-300 dark:text-gray-600 mb-4">
        {icon || <Inbox className="w-12 h-12 mx-auto" />}
      </div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
      {description && <p className="text-sm text-gray-400 mb-4">{description}</p>}

      {showQuickStart && (
        <div className="mt-6 max-w-lg mx-auto">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Terminal className="w-4 h-4 text-indigo-500" />
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">快速接入</h4>
          </div>
          <div className="bg-gray-900 dark:bg-gray-950 rounded-xl p-4 text-left overflow-x-auto">
            <pre className="text-[11px] font-mono text-green-400 leading-relaxed whitespace-pre-wrap">{SDK_SNIPPET}</pre>
          </div>
          <div className="flex items-center justify-center gap-4 mt-4 text-[11px]">
            <a
              href="https://github.com/your-org/tracing/blob/main/tracing_sdk/README.md"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-indigo-500 hover:text-indigo-600 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              SDK 文档
            </a>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-gray-400">
              启动 Dashboard: <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[11px]">trace-server</code>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
