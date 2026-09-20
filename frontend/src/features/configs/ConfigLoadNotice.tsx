import { useEffect, useState } from "react";

interface Props {
  message: string | null;
}

export function ConfigLoadNotice({ message }: Props) {
  const [fading, setFading] = useState(false);
  const [visibleMessage, setVisibleMessage] = useState<string | null>(message);

  useEffect(() => {
    if (!message) {
      setVisibleMessage(null);
      return;
    }
    setVisibleMessage(message);
    setFading(false);
    const fadeTimer = window.setTimeout(() => setFading(true), 3000);
    const removeTimer = window.setTimeout(() => setVisibleMessage(null), 6000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [message]);

  if (!visibleMessage) return null;
  return (
    <div className={`alert alert--info config-notice${fading ? " config-notice--fading" : ""}`} role="status">
      {visibleMessage}
    </div>
  );
}
