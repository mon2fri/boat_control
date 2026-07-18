import { useConfig } from "../settings/useSettings";

interface ConfigLoaderProps {
  configType: "settings" | "rules" | "filters";
  name: string;
  onLoad: (content: unknown) => void;
  onDone: () => void;
}

export function ConfigLoader({ configType, name, onLoad, onDone }: ConfigLoaderProps) {
  const query = useConfig(configType, name);

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

  if (query.data) {
    onLoad(query.data.content);
    onDone();
  }

  return null;
}
