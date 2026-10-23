'use client';

import { useEffect, useState } from 'react';

// The upload replies before the check is saved, so the dashboard waits for it to appear
const KEY = 'cv-upload';
const WAIT_MS = 60_000;

export function rememberUpload(id) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ id, at: Date.now() }));
  } catch {
    /* only used to show a placeholder row */
  }
}

/** Id of a check uploaded in the last minute that isn't in `checks` yet, or null. */
export function useJustUploaded(checks) {
  const [upload, setUpload] = useState(null);
  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem(KEY));
      if (u && Date.now() - u.at < WAIT_MS) setUpload(u);
    } catch {
      /* ignore */
    }
  }, []);
  const arrived = upload && checks?.some((c) => c._id === upload.id);
  useEffect(() => {
    if (!arrived) return;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, [arrived]);
  return upload && !arrived && checks ? upload.id : null;
}
