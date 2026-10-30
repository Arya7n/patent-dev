export function toVectorLiteral(values: number[], dimensions: number): string {
  if (values.length !== dimensions) {
    throw new Error(`Unexpected embedding size: expected ${dimensions}, got ${values.length}`);
  }
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Invalid embedding");
  return `[${values.join(",")}]`;
}
