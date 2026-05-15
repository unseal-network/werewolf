/**
 * create.tsx — Entry point only.
 *
 * Decides which create page to render based on the runtime:
 *   • isHostRuntime() === true  → IframeCreatePage  (LobbyPage-style mobile UI)
 *   • isHostRuntime() === false → TestCreatePage    (desktop card UI with token input)
 *
 * No state, no UI, no business logic lives here.
 */
import { isHostRuntime } from "../runtime/hostBridge";
import { IframeCreatePage, type IframeCreatePageProps } from "./create-iframe";
import { TestCreatePage, type TestCreatePageProps } from "./create-test";

export interface CreateGamePageProps
  extends TestCreatePageProps,
    IframeCreatePageProps {}

export function CreateGamePage(props: CreateGamePageProps) {
  if (isHostRuntime()) {
    return <IframeCreatePage {...props} />;
  }
  return <TestCreatePage {...props} />;
}
