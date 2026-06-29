// Data layer — talks directly to Supabase Postgres functions (RPC).
// Every function returns the same { meId, session } shape the UI expects.
import { supabase, userToken } from "./supabase.js";

const CODE_KEY = "gg.code";
export const getCode = () => localStorage.getItem(CODE_KEY) || "";
export const setCode = (code) => code && localStorage.setItem(CODE_KEY, code);
export const clearSession = () => localStorage.removeItem(CODE_KEY);

async function rpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, { ...args, p_token: userToken() });
  if (error) throw new Error(error.message || "Something went wrong.");
  return data; // jsonb -> { meId, session }
}

export const api = {
  createSession: (name, hostName, startingBalance) =>
    rpc("create_session", {
      p_name: name,
      p_host_name: hostName,
      p_starting_balance: startingBalance,
    }),
  joinSession: (code, name) =>
    rpc("join_session", { p_code: code, p_name: name }),
  getSession: (code) => rpc("get_session", { p_code: code }),
  lockSession: (sessionId) => rpc("lock_session", { p_session_id: sessionId }),

  createBet: (sessionId, question, outcomes) =>
    rpc("create_bet", {
      p_session_id: sessionId,
      p_question: question,
      p_outcomes: outcomes,
    }),
  wager: (betId, outcomeId, amount) =>
    rpc("place_wager", {
      p_bet_id: betId,
      p_outcome_id: outcomeId,
      p_amount: amount,
    }),
  lockBet: (betId) => rpc("lock_bet", { p_bet_id: betId }),
  resolveBet: (betId, winningOutcomeId) =>
    rpc("resolve_bet", {
      p_bet_id: betId,
      p_winning_outcome_id: winningOutcomeId,
    }),

  createChallenge: (sessionId, title, reward) =>
    rpc("create_challenge", {
      p_session_id: sessionId,
      p_title: title,
      p_reward: reward,
    }),
  completeChallenge: (id, memberId) =>
    rpc("complete_challenge", { p_challenge_id: id, p_member_id: memberId }),
  cancelChallenge: (id) => rpc("cancel_challenge", { p_challenge_id: id }),

  comment: (targetType, targetId, text) =>
    rpc("add_comment", {
      p_target_type: targetType,
      p_target_id: targetId,
      p_text: text,
    }),
  react: (targetType, targetId, emoji) =>
    rpc("toggle_reaction", {
      p_target_type: targetType,
      p_target_id: targetId,
      p_emoji: emoji,
    }),
};
