// Fixture: a .ts file using decorators. With `experimentalDecorators` and
// `emitDecoratorMetadata` on (the loader's defaults), the TypeScript compiler
// emits `__metadata("design:paramtypes", [Repository])`, which the downstream
// DI framework relies on. The compiler's helper records metadata through
// `Reflect.metadata` when it exists (reflect-metadata installs it); the stub
// below prints what it receives instead.
;(Reflect as any).metadata = (key: string, value: unknown) => () => {
  if (key === 'design:paramtypes') {
    const names = (value as Function[]).map((type) => type.name)
    console.log(`${key}=${names.join(',')}`)
  }
}

class Repository {}

function Injectable(_target: unknown): void {}

@Injectable
class Service {
  constructor(private readonly repo: Repository) {}
}

console.log('decorators-ran')
