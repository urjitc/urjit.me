export function requireElement<T extends typeof Element>(
  id: string,
  constructor: T,
): InstanceType<T> {
  const element = document.getElementById(id)
  if (!(element instanceof constructor)) throw new Error(`#${id} is missing`)
  return element as InstanceType<T>
}
