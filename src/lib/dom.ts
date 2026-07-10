export function requireElement<T extends typeof Element>(
  id: string,
  constructor: T,
): InstanceType<T> {
  const element = document.getElementById(id)
  if (!(element instanceof constructor)) throw new Error(`#${id} is missing`)
  return element as InstanceType<T>
}

export function getCanvasContext(
  target: HTMLCanvasElement,
  willReadFrequently = false,
): CanvasRenderingContext2D {
  const value = target.getContext('2d', { willReadFrequently })
  if (value === null) throw new Error('Canvas 2D is unavailable')
  return value
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = src
  if (image.decode) return image.decode().then(() => image)
  if (image.complete && image.naturalWidth > 0) return Promise.resolve(image)
  return new Promise((resolve, reject) => {
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener('error', () => reject(new Error(`failed to load ${src}`)), { once: true })
  })
}
