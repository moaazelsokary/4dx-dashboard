import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Bold, Italic, Underline, List, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import DOMPurify from 'dompurify';

interface ContentEditorProps {
  content: string;
  onChange: (content: string) => void;
  title?: string;
  onTitleChange?: (title: string) => void;
}

export default function ContentEditor({
  content,
  onChange,
  title,
  onTitleChange,
}: ContentEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);

  // Save selection when textarea focus changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleSelectionChange = () => {
      setSelection({
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      });
    };

    textarea.addEventListener('select', handleSelectionChange);
    textarea.addEventListener('click', handleSelectionChange);
    textarea.addEventListener('keyup', handleSelectionChange);

    return () => {
      textarea.removeEventListener('select', handleSelectionChange);
      textarea.removeEventListener('click', handleSelectionChange);
      textarea.removeEventListener('keyup', handleSelectionChange);
    };
  }, []);

  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = selection?.start ?? textarea.selectionStart;
    const end = selection?.end ?? textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const newText =
      content.substring(0, start) +
      before +
      selectedText +
      after +
      content.substring(end);

    onChange(newText);

    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + before.length + selectedText.length + after.length;
      textarea.setSelectionRange(newPosition, newPosition);
      setSelection({ start: newPosition, end: newPosition });
    }, 0);
  };

  const formatBold = () => insertText('**', '**');
  const formatItalic = () => insertText('*', '*');
  const formatUnderline = () => insertText('<u>', '</u>');
  const formatList = () => insertText('- ', '');
  const formatLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      const text = selection
        ? content.substring(selection.start, selection.end)
        : 'Link Text';
      insertText(`[${text}](`, ')');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Content Editor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {title !== undefined && onTitleChange && (
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Page title"
            />
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="content">Content</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={formatBold}
                title="Bold"
              >
                <Bold className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={formatItalic}
                title="Italic"
              >
                <Italic className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={formatUnderline}
                title="Underline"
              >
                <Underline className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={formatList}
                title="List"
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={formatLink}
                title="Link"
              >
                <LinkIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <Textarea
            ref={textareaRef}
            id="content"
            value={content}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter page content (supports Markdown and HTML)"
            rows={15}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Supports Markdown and HTML. Content will be sanitized for security.
          </p>
        </div>

        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-2">Preview</h4>
          <div
            className="prose prose-sm max-w-none p-4 border rounded-md bg-muted/50 min-h-[200px]"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(
                content
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\*(.*?)\*/g, '<em>$1</em>')
                  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
                  .replace(/^- (.*)$/gm, '<li>$1</li>')
                  .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
              ),
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

