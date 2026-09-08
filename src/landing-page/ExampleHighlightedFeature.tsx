import aiReadyDark from "../client/static/assets/aiready-dark.webp";
import aiReady from "../client/static/assets/aiready.webp";
import { HighlightedFeature } from "./components/HighlightedFeature";

export function AIReady() {
  return (
    <HighlightedFeature
      name="重点功能"
      description="通过清晰的悬赏流程，让需求与交付高效匹配。"
      highlightedComponent={<AIReadyExample />}
      direction="row-reverse"
    />
  );
}

function AIReadyExample() {
  return (
    <div className="w-full">
      <img
        src={aiReady}
        alt="功能展示"
        loading="lazy"
        className="dark:hidden"
      />
      <img
        src={aiReadyDark}
        alt="功能展示"
        loading="lazy"
        className="hidden dark:block"
      />
    </div>
  );
}
