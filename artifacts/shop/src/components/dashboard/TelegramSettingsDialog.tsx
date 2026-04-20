import { Send, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface TelegramSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telegramToken: string;
  setTelegramToken: (value: string) => void;
  telegramUsername: string;
  setTelegramUsername: (value: string) => void;
  storeTelegramBotUsername: string | null | undefined;
  onSave: () => void;
  isUpdatePending: boolean;
  isWebhookPending: boolean;
}

export function TelegramSettingsDialog({
  open,
  onOpenChange,
  telegramToken,
  setTelegramToken,
  telegramUsername,
  setTelegramUsername,
  storeTelegramBotUsername,
  onSave,
  isUpdatePending,
  isWebhookPending,
}: TelegramSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-500" /> Telegram AI Bot
          </DialogTitle>
          <DialogDescription>
            Create a bot with <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">@BotFather</a> on Telegram, then paste the token and username below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Bot Token</label>
            <Input
              placeholder="e.g. 123456789:AAFBxxxxxxxxxxxxxxxxxxxxxxx"
              value={telegramToken}
              onChange={e => setTelegramToken(e.target.value)}
              type="password"
            />
            <p className="text-xs text-muted-foreground">From @BotFather — keep this secret</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Bot Username</label>
            <Input
              placeholder="e.g. @myshop_bot"
              value={telegramUsername}
              onChange={e => setTelegramUsername(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">The @username of your bot — shown as a button on your storefront</p>
          </div>
          {storeTelegramBotUsername && (
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">To receive order notifications:</p>
              <p>Open your bot (<a href={`https://t.me/${storeTelegramBotUsername.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="underline font-mono">@{storeTelegramBotUsername.replace(/^@/, '')}</a>) and send it <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">/register</span>. You'll get a confirmation and receive a Telegram message each time a customer places an order.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={onSave}
            disabled={isUpdatePending || isWebhookPending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {(isUpdatePending || isWebhookPending) && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Save & Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
