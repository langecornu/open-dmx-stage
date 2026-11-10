// "Detect adapter" button: asks the adapter on the chosen port what kind it is, and reports the answer in plain words.
import { useState } from 'react';

import { api } from '../api.js';

export function DetectAdapter({ serialPath, onResult }) {
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const handleDetect = async () => {
    setIsBusy(true);
    setMessage(null);
    try {
      const result = await api.detectAdapter(serialPath);
      onResult(result);
      setMessage({ kind: 'ok', text: result.message });
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="btn" onClick={handleDetect} disabled={isBusy || serialPath === ''}>
        {isBusy ? 'Detecting…' : 'Detect adapter'}
      </button>
      {message ? (
        <p
          className={message.kind === 'error' ? 'error-banner detect-message' : 'view-sub detect-message'}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      ) : null}
    </>
  );
}
