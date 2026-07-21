import { NotFoundView } from "../../_components/not-found-view";

/**
 * Server component wrapper: Next's file convention loads this module on the
 * server, and `NotFoundView` is the client part that reads the locale.
 */
export default function NotFound() {
  return <NotFoundView />;
}
