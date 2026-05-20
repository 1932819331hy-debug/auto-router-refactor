import type {
  HyperGraphConnection,
  HyperGraphPort,
} from "../hgportpointpathingsolver/index.ts"

/**
 * Routed path produced for one connection.
 */
export class RoutedConnectionPath {
  public constructor(
    public readonly connection: HyperGraphConnection,
    public readonly pathPorts: HyperGraphPort[],
  ) {}
}
