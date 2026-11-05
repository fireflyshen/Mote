import { useRef, useState } from "react";
import { randomUUID } from "node:crypto";
import {
  Action,
  ActionPanel,
  closeMainWindow,
  Form,
  getPreferenceValues,
  LocalStorage,
  showToast,
  Toast,
} from "@raycast/api";
import { memoContent, sendMemo } from "./api";
import { sendSshMemo } from "./ssh";
interface Preferences {
  transport: string;
  sshTarget?: string;
  serverUrl: string;
  captureToken: string;
  defaultTags?: string;
}
export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const [memo, setMemo] = useState("");
  const [tags, setTags] = useState(preferences.defaultTags || "");
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  async function submit(values: { memo: string; tags: string }) {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "正在发送…",
    });
    try {
      const content = memoContent(values.memo, values.tags);
      const destination =
        preferences.transport === "ssh"
          ? `ssh:${preferences.sshTarget || "rn"}`
          : new URL(preferences.serverUrl).origin;
      const key = `mote-pending:${destination}`;
      const raw = await LocalStorage.getItem<string>(key);
      let previous: { id: string; content: string } | undefined;
      try {
        previous = raw ? JSON.parse(raw) : undefined;
      } catch {
        /* Recover from a corrupt cache. */
      }
      const pending = previous?.content === content ? previous : { id: randomUUID(), content };
      await LocalStorage.setItem(key, JSON.stringify(pending));
      if (preferences.transport === "ssh")
        await sendSshMemo(preferences.sshTarget || "rn", preferences.captureToken, pending);
      else await sendMemo(preferences.serverUrl, preferences.captureToken, pending);
      await LocalStorage.removeItem(key);
      setMemo("");
      setTags(preferences.defaultTags || "");
      toast.style = Toast.Style.Success;
      toast.title = "已记录到 Mote";
      await closeMainWindow({ clearRootSearch: true });
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "发送未完成，草稿已保留";
      toast.message = error instanceof Error ? error.message : "请检查连接后重试";
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  return (
    <Form
      enableDrafts
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Send MEMO"
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="memo"
        title="MEMO"
        placeholder="现在的想法是…"
        value={memo}
        onChange={setMemo}
      />
      <Form.TextField
        id="tags"
        title="Tags"
        placeholder="#想法 #碎记"
        value={tags}
        onChange={setTags}
        info="标签用空格分隔，支持 #标签/子标签"
      />
    </Form>
  );
}
