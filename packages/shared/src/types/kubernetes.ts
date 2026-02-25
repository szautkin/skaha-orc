export interface Pod {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
  age: string;
  node: string;
}

export interface KubeEvent {
  type: string;
  reason: string;
  message: string;
  source: string;
  age: string;
  count: number;
}

export interface LogLine {
  timestamp: string;
  message: string;
}
