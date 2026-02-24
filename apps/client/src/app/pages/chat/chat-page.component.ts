import { TokenStorageService } from '@ghostfolio/client/services/token-storage.service';

import { CommonModule } from '@angular/common';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: string[];
  isStreaming?: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  selector: 'gf-chat-page',
  styleUrls: ['./chat-page.scss'],
  templateUrl: './chat-page.html'
})
export class GfChatPageComponent implements OnDestroy {
  @ViewChild('messagesContainer') private messagesContainer: ElementRef;

  public inputMessage = '';
  public isLoading = false;
  public messages: ChatMessage[] = [];
  public threadId: string | undefined;

  private activeTools: string[] = [];
  private eventSource: EventSource | null = null;

  public constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly tokenStorageService: TokenStorageService
  ) {}

  public ngOnDestroy() {
    this.closeEventSource();
  }

  public onSendMessage() {
    const message = this.inputMessage.trim();

    if (!message || this.isLoading) {
      return;
    }

    this.messages.push({ role: 'user', content: message });
    this.inputMessage = '';
    this.isLoading = true;
    this.activeTools = [];
    this.changeDetectorRef.markForCheck();

    // Add streaming assistant placeholder
    this.messages.push({
      role: 'assistant',
      content: '',
      isStreaming: true,
      toolCalls: []
    });

    this.streamChat(message);
  }

  public onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSendMessage();
    }
  }

  private streamChat(message: string) {
    this.closeEventSource();

    const token = this.tokenStorageService.getToken();

    // Use fetch with POST for SSE (EventSource only supports GET)
    fetch('/api/v1/agents/chat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        threadId: this.threadId
      })
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('No response body');
        }

        const processStream = async () => {
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  this.handleSSEEvent(data);
                } catch {
                  // Skip malformed JSON
                }
              }
            }
          }
        };

        return processStream();
      })
      .catch(() => {
        const assistantMsg = this.messages[this.messages.length - 1];

        if (assistantMsg?.role === 'assistant') {
          assistantMsg.content =
            'Sorry, I encountered an error. Please try again.';
          assistantMsg.isStreaming = false;
        }

        this.isLoading = false;
        this.changeDetectorRef.markForCheck();
      });
  }

  private handleSSEEvent(data: {
    type: string;
    content?: string;
    tool?: string;
    threadId?: string;
    confidence?: number;
  }) {
    const assistantMsg = this.messages[this.messages.length - 1];

    if (!assistantMsg || assistantMsg.role !== 'assistant') {
      return;
    }

    switch (data.type) {
      case 'token':
        assistantMsg.content += data.content ?? '';
        break;

      case 'tool_start':
        if (data.tool) {
          this.activeTools.push(data.tool);
          assistantMsg.toolCalls = [...this.activeTools];
        }
        break;

      case 'tool_end':
        if (data.tool) {
          this.activeTools = this.activeTools.filter((t) => t !== data.tool);
        }
        break;

      case 'complete':
        assistantMsg.isStreaming = false;

        if (data.content) {
          assistantMsg.content = data.content;
        }

        if (data.threadId) {
          this.threadId = data.threadId;
        }

        this.isLoading = false;
        break;

      case 'error':
        assistantMsg.content = data.content ?? 'An error occurred.';
        assistantMsg.isStreaming = false;
        this.isLoading = false;
        break;
    }

    this.changeDetectorRef.markForCheck();
    this.scrollToBottom();
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.messagesContainer?.nativeElement) {
        const el = this.messagesContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  private closeEventSource() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
