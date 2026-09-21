import { useConfig } from "../settings/useSettings";
import { useEffect } from "react";

interface ConfigLoaderProps {
  configType: "rules" | "filters" | "rows-and-columns";
  name: string;
  onLoad: (content: unknown, name: string) => void;
  onDone: () => void;
}

export function ConfigLoader({ configType, name, onLoad, onDone }: ConfigLoaderProps) {
  const query = useConfig(configType, name);

  useEffect(() => {
    if (query.data) {
      onLoad(query.data.content, name);
      onDone();
    }
  }, [query.data, onLoad, onDone]);

  if (query.isPending) {
    return <p role="status">Loading {configType} config…</p>;
  }

  if (query.isError) {
    return (
      <p className="alert alert--error">
        Could not load config: {query.error?.message ?? "unknown"}
      </p>
    );
  }

  return null;
}
