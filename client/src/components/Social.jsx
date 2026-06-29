import { useState } from "react";
import { api } from "../api.js";

const EMOJIS = ["🔥", "😂", "😮", "💀", "👍"];

// Reactions bar + collapsible comments, shared by bets and challenges.
export default function Social({ targetType, target, me, act }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const reactions = target.reactions || {};
  const comments = target.comments || [];

  function toggle(emoji) {
    if (!me) return;
    act(() => api.react(targetType, target.id, emoji));
  }

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const t = text.trim();
    setText("");
    await act(() => api.comment(targetType, target.id, t));
  }

  return (
    <div className="social">
      <div className="reactions">
        {EMOJIS.map((emoji) => {
          const r = reactions[emoji];
          return (
            <button
              key={emoji}
              className={"react" + (r?.mine ? " mine" : "")}
              onClick={() => toggle(emoji)}
              disabled={!me}
            >
              {emoji}
              {r?.count ? <span className="rc">{r.count}</span> : null}
            </button>
          );
        })}
        <button className="react comment-toggle" onClick={() => setOpen((v) => !v)}>
          💬{comments.length ? <span className="rc">{comments.length}</span> : null}
        </button>
      </div>

      {open && (
        <div className="comments">
          {comments.map((c, i) => (
            <div key={i} className="comment">
              <span className="c-author">{c.author}</span> {c.text}
            </div>
          ))}
          {comments.length === 0 && <div className="muted small">No comments yet.</div>}
          {me && (
            <form className="comment-form" onSubmit={send}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Add a comment…"
                maxLength={280}
              />
              <button className="btn primary sm" disabled={!text.trim()}>
                Send
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
