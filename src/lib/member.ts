import { useEffect, useState } from "react";

const GMAIL_KEY = "rarecognos.gmail.v1";
const PROGRESS_KEY = "rarecognos.progress.v1";
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || "";

export type GmailUser = { email: string; name: string };

type Progress = { xp: number; hello: boolean; checkin?: string; held?: boolean };

function readProgress(): Record<string, Progress> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function memberKey(wallet?: string, email?: string) {
  if (wallet) return `wallet:${wallet.toLowerCase()}`;
  if (email) return `gmail:${email.toLowerCase()}`;
  return "";
}

export function readGmail(): GmailUser | null {
  try {
    const raw = localStorage.getItem(GMAIL_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as GmailUser;
    return user.email ? user : null;
  } catch {
    return null;
  }
}

export function writeGmail(user: GmailUser | null) {
  if (user) localStorage.setItem(GMAIL_KEY, JSON.stringify(user));
  else localStorage.removeItem(GMAIL_KEY);
  window.dispatchEvent(new Event("rarecognos-gmail"));
}

export function progressFor(key: string): Progress {
  return readProgress()[key] || { xp: 0, hello: false };
}

export function saveProgress(key: string, next: Progress) {
  const all = readProgress();
  all[key] = next;
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  window.dispatchEvent(new Event("rarecognos-progress"));
}

export function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

function loadGoogle() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(Error("Google sign-in could not be loaded."));
    document.head.appendChild(script);
  });
}

export async function signInGmail() {
  if (!GOOGLE_CLIENT_ID) {
    throw Error("Gmail sign-in needs a Google client ID for rarecognos.vercel.app.");
  }
  await loadGoogle();
  const token = await new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "openid email profile",
      callback: (response) => {
        if (response.error || !response.access_token) reject(Error(response.error || "Gmail was cancelled."));
        else resolve(response.access_token);
      },
    });
    client.requestAccessToken();
  });
  const profile = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!profile.ok) throw Error("Gmail profile could not be read.");
  const body = (await profile.json()) as { email?: string; name?: string };
  if (!body.email) throw Error("This Google account has no email.");
  const user = { email: body.email, name: body.name || body.email };
  writeGmail(user);
  return user;
}

export function useGmail() {
  const [user, setUser] = useState<GmailUser | null>(null);
  useEffect(() => {
    const read = () => setUser(readGmail());
    read();
    window.addEventListener("rarecognos-gmail", read);
    return () => window.removeEventListener("rarecognos-gmail", read);
  }, []);
  return user;
}

export function useProgress(key: string) {
  const [value, setValue] = useState<Progress>({ xp: 0, hello: false });
  useEffect(() => {
    const read = () => setValue(key ? progressFor(key) : { xp: 0, hello: false });
    read();
    window.addEventListener("rarecognos-progress", read);
    return () => window.removeEventListener("rarecognos-progress", read);
  }, [key]);
  return value;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}
