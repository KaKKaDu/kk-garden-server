export class Variables<T extends Readonly<Record<string, unknown>>> {
  private readonly variables: Readonly<T>;

  private constructor(variables: T) {
    this.variables = Object.freeze({ ...variables });
  }

  public static of<const T extends Readonly<Record<string, unknown>>>(
    variables: T,
  ): Variables<T> {
    return new Variables(variables);
  }

  public get<K extends keyof T>(key: K): T[K] {
    return this.variables[key];
  }
}
