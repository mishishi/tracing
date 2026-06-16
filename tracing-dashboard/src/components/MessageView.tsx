import { Bot, User, Wrench } from 'lucide-react';
import { JsonBlock } from './JsonBlock';

interface MessageViewProps {
  content: string;
  maxHeight?: number;
}

function tryParseMessages(content: string): Array<{ role: string; content: string }> | null {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].role) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

const roleConfig: Record<string, { icon: React.ReactNode; label: string; bg: string; text: string }> = {
  system: { icon: <Wrench className="w-3.5 h-3.5" />, label: '系统', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' },
  user: { icon: <User className="w-3.5 h-3.5" />, label: '用户', bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-700 dark:text-indigo-300' },
  assistant: { icon: <Bot className="w-3.5 h-3.5" />, label: '助手', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300' },
  tool: { icon: <Wrench className="w-3.5 h-3.5" />, label: '工具', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300' },
};

export function MessageView({ content, maxHeight = 400 }: MessageViewProps) {
  const messages = tryParseMessages(content);

  if (!messages) {
    // Not a messages array, fall back to JSON block
    return <JsonBlock label="" content={content} maxHeight={maxHeight} />;
  }

  return (
    <div className="space-y-2" style={{ maxHeight, overflowY: 'auto' }}>
      {messages.map((msg, idx) => {
        const cfg = roleConfig[msg.role] || roleConfig.system;
        return (
          <div key={idx} className={`flex gap-2 p-2.5 rounded-lg ${cfg.bg}`}>
            <div className="shrink-0 mt-0.5">
              {cfg.icon}
            </div>
            <div className="min-w-0 flex-1">
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${cfg.text}`}>
                {cfg.label}
              </span>
              <pre className="text-[11px] mt-1 whitespace-pre-wrap font-sans text-gray-700 dark:text-gray-300 leading-relaxed break-words">
                {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)}
              </pre>
            </div>
          </div>
        );
      })}
    </div>
  );
}
