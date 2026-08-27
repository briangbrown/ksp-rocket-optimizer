<!-- Sourced from https://mkosir.github.io/typescript-style-guide/ via
     briangbrown/drumline-scores. The body below is unmodified; the section
     immediately following is the only addition. -->

# Where this project differs

This guide is staged here for the TypeScript conversion ([#11]) — the source is
still `.jsx` today, so nothing below applies yet.

Four of its rules contradict deliberate choices in this repository. Where they
conflict, this section wins.

- **"Always use named exports. Avoid default exports."**
  `KSPMissionPlanner` is a default export and stays one. The component is meant
  to be droppable into any React project or pasted into a Claude artifact, which
  is where it was written. The named exports at the foot of the file exist for
  the tests and are added when something needs them, not as a convention.

- **"Organise files/folders by feature. Collocate related code as close as
  possible."** and **"Match the file name to its primary export."**
  The application is one file on purpose. Part tables, physics, solver and UI
  all live in `src/ksp-mission-planner.jsx`, and it is not to be split. File
  naming rules have nothing to act on.

- **"Collocate `foo.ts` and `foo.test.ts` rather than separating source and
  tests."** Tests live in `test/`, because they test the file as a whole rather
  than any module within it.

- **"Discourage snapshot testing."**
  The design snapshot is the primary verification in this repository and the
  reason a TypeScript conversion is affordable at all. It is a characterisation
  test over a search space too wide to assert on by hand — see the
  verification section of `CLAUDE.md`. Do not weaken or remove it on the
  strength of this rule.

Everything else — type inference, immutability, discriminated unions,
`satisfies`, no `any`, no assertions, naming, return types — applies as written
and is worth following.

[#11]: https://github.com/briangbrown/ksp-rocket-optimizer/issues/11

---

# TypeScript Style Guide

> Source: <https://mkosir.github.io/typescript-style-guide/>

## Introduction

The TypeScript Style Guide provides conventions and best practices for consistent, maintainable code through a combination of automated tooling and design principles.

### Purpose
- Enforce consistency using ESLint, TypeScript, Prettier, and similar tools
- Reduce code review discussions about style
- Maintain code quality as projects grow in complexity
- Accelerate development cycles through standardization

### Disclaimer
This guide is opinionated. Teams should adapt conventions to their specific needs while maintaining internal consistency.

### Requirements
- TypeScript v5+
- typescript-eslint v8 with strict-type-checked configuration
- Assumes (but not limited to): React, Playwright, Vitest

---

## TLDR — Key Principles

- Embrace const assertions for type safety and immutability
- Strive for data immutability using `Readonly` and `ReadonlyArray`
- Make majority of object properties required; use optional properties sparingly
- Embrace discriminated unions
- Avoid type assertions in favor of proper type definitions
- Pursue pure, stateless functions with single responsibility
- Maintain consistent and readable naming conventions
- Use named exports exclusively
- Organize code by feature with collocation

---

## Types

### Type Inference

**Explicitly declare types only when narrowing them.**

```typescript
// ❌ Avoid
const employees = new Map(); // Inferred as 'Map<any, any>'
const [userRole, setUserRole] = useState('admin'); // Inferred as 'string'

// ✅ Use
const employees = new Map<string, number>();
const [userRole, setUserRole] = useState<UserRole>('admin');
```

Avoid explicit types when they can be inferred:

```typescript
// ❌ Avoid
const userRole: string = 'admin';
const [isActive, setIsActive] = useState<boolean>(false);

// ✅ Use
const USER_ROLE = 'admin'; // Narrowed to literal type 'admin'
const [isActive, setIsActive] = useState(false);
```

### Data Immutability

Use `Readonly` and `ReadonlyArray` to prevent accidental mutations:

```typescript
// ❌ Avoid
const removeFirstUser = (users: Array<User>) => {
  return users.splice(1);
};

// ✅ Use
const removeFirstUser = (users: ReadonlyArray<User>) => {
  return users.slice(1);
};
```

### Required & Optional Object Properties

**Strive to make majority of object properties required.**

```typescript
// ❌ Avoid
type User = {
  id?: number;
  email?: string;
  dashboardAccess?: boolean;
};

// ✅ Use discriminated unions
type AdminUser = {
  role: 'admin';
  id: number;
  email: string;
  dashboardAccess: boolean;
};

type RegularUser = {
  role: 'regular';
  id: number;
  email: string;
};

type User = AdminUser | RegularUser;
```

### Discriminated Union

Discriminated unions (tagged unions) provide powerful type safety benefits:

- Remove optional properties through variant separation
- Enable exhaustiveness checking in switches
- Avoid boolean flag complexity
- Clarify code intent
- Support TypeScript type narrowing
- Simplify refactoring

```typescript
type Circle = { kind: 'circle'; radius: number };
type Square = { kind: 'square'; size: number };
type Shape = Circle | Square;

const calculateArea = (shape: Shape) => {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'square':
      return shape.size * shape.size;
  }
};
```

### Type-Safe Constants With Satisfies

Combine `as const` for immutability with `satisfies` for validation:

```typescript
// ✅ Array constants
type UserRole = 'admin' | 'editor' | 'moderator' | 'viewer' | 'guest';
const DASHBOARD_ACCESS_ROLES = ['admin', 'editor', 'moderator'] as const
  satisfies ReadonlyArray<UserRole>;

// ✅ Object constants
type OrderStatus = {
  pending: 'pending' | 'idle';
  fulfilled: boolean;
  error: string;
};
const IDLE_ORDER = {
  pending: 'idle',
  fulfilled: true,
  error: 'Shipping Error',
} as const satisfies OrderStatus;
```

### Template Literal Types

Use template literal types to create precise, type-safe string constructs:

```typescript
// String Patterns
type Version = `v${number}.${number}.${number}`;
const appVersion: Version = 'v2.6.1';

// API Endpoints
type ApiRoute = 'users' | 'posts' | 'comments';
type ApiEndpoint = `/api/${ApiRoute}`;
const userEndpoint: ApiEndpoint = '/api/users';

// CSS Utilities
type BaseColor = 'blue' | 'red' | 'yellow';
type Variant = 50 | 100 | 200 | 300 | 400;
type Color = `${BaseColor}-${Variant}` | `#${string}`;
const iconColor: Color = 'blue-400';
```

### Type `any` & `unknown`

**Never use `any`.** Use `unknown` as the type-safe alternative:

```typescript
// ❌ Avoid
const foo: any = 'five';
const bar: number = foo; // No type error

// ✅ Use
const foo: unknown = 5;
// Narrow the type before use
const isNumber = (num: unknown): num is number => typeof num === 'number';
if (!isNumber(foo)) throw Error('Expected number');
const bar: number = foo;
```

### Type & Non-nullability Assertions

Avoid type assertions (`user as User`) and non-nullability assertions (`user!.name`) except in rare cases. When unavoidable, use `@ts-expect-error` with a clear description — never `@ts-ignore`.

### Type Definition

**Use `type` for all type definitions consistently.** Exception: `interface` for declaration merging only.

```typescript
// ❌ Avoid (interface for regular shapes)
interface UserInfo {
  name: string;
}

// ✅ Use
type UserRole = 'admin' | 'guest';
type UserInfo = {
  name: string;
  role: UserRole;
};
```

### Array Types

Use generic array syntax:

```typescript
// ❌ Avoid
const x: string[] = ['foo', 'bar'];
const y: readonly string[] = ['foo', 'bar'];

// ✅ Use
const x: Array<string> = ['foo', 'bar'];
const y: ReadonlyArray<string> = ['foo', 'bar'];
```

### Type Imports and Exports

Always separate type imports from runtime imports:

```typescript
// ❌ Avoid
import { MyClass } from 'some-library';

// ✅ Use
import type { MyClass } from 'some-library';
```

---

## Functions

### General Principles

Functions should:
- Have single responsibility
- Be stateless (same inputs produce same outputs)
- Accept at least one argument and return data
- Be pure without side effects

### Single Object Arg

Use a single object parameter instead of multiple arguments (exception: single primitive args):

```typescript
// ❌ Avoid
transformUserInput('client', false, 60, 120, null, true, 2000);

// ✅ Use
transformUserInput({
  method: 'client',
  isValidated: false,
  minLines: 60,
  maxLines: 120,
  defaultInput: null,
  shouldLog: true,
  timeout: 2000,
});
```

### Args as Discriminated Type

Use discriminated unions to eliminate optional function parameters:

```typescript
// ❌ Avoid
type StatusParams = {
  data?: Products;
  title?: string;
  time?: number;
  error?: string;
};

// ✅ Use
type StatusSuccessParams = { status: 'success'; data: Products; title: string };
type StatusLoadingParams = { status: 'loading'; time: number };
type StatusErrorParams  = { status: 'error'; error: string };
type StatusParams = StatusSuccessParams | StatusLoadingParams | StatusErrorParams;
```

### Return Types

Explicitly declare return types for public APIs and wherever it improves clarity:

```typescript
function getUserById(id: string): User | null { /* ... */ }
const formatDate = (date: Date): string => date.toISOString();
```

---

## Variables

### Const Assertion

Use `as const` for constants to narrow types and ensure immutability:

```typescript
// Objects
const FOO_LOCATION = { x: 50, y: 130 } as const;
// Type { readonly x: 50; readonly y: 130; }

// Arrays
const BAR_LOCATION = [50, 130] as const; // Type readonly [50, 130]

// Template literals
const RATE_LIMIT_MESSAGE = `Max requests/min is ${25}.` as const;
```

### Enums & Const Assertion

**Avoid enums.** Prefer literal types or const assertion:

```typescript
// ❌ Avoid
enum UserRole { GUEST = 'guest', MODERATOR = 'moderator' }

// ✅ Use literal types
type UserRole = 'guest' | 'moderator' | 'administrator';

// ✅ Use const assertion for iteration
const USER_ROLES = ['guest', 'moderator', 'administrator'] as const;
type UserRole = (typeof USER_ROLES)[number];

// ✅ Use const assertion objects
const COLORS = { primary: '#B33930', secondary: '#113A5C' } as const;
type ColorValue = (typeof COLORS)[keyof typeof COLORS];
```

### Type Union & Boolean Flags

Embrace type unions instead of multiple boolean flags:

```typescript
// ❌ Avoid
const isPending, isProcessing, isConfirmed, isExpired;

// ✅ Use
type UserStatus = 'pending' | 'processing' | 'confirmed' | 'expired';
const userStatus: UserStatus;
```

### Null & Undefined

- Use `null` to explicitly indicate no value
- Use `undefined` when a value doesn't exist

---

## Naming

### Named Exports

**Always use named exports.** Avoid default exports.

```typescript
// ❌ Avoid
export default function MyComponent() {}

// ✅ Use
export function MyComponent() {}
export const myHelper = () => {};
```

### Naming Conventions

| Category | Convention | Example |
|---|---|---|
| Local variables | camelCase | `products`, `productsFiltered` |
| Booleans | `is`/`has` prefix | `isDisabled`, `hasProduct` |
| Constants | UPPER_SNAKE_CASE | `FEATURED_PRODUCT_ID` |
| Functions | camelCase | `filterProductsByType()` |
| Types | PascalCase | `OrderStatus`, `ProductItem` |
| Generics | PascalCase prefixed with `T` | `<TRequest>`, `<TFooBar>` |
| React components | PascalCase | `ProductItem`, `ProductsPage` |
| Prop types | Component name + `Props` | `ProductItemProps` |
| React hooks | `use` prefix | `useGetProducts()` |

### File Naming

- Use **kebab-case** for all file names: `paddle-viz.ts`, `user-profile.tsx`.
- Match the file name to its primary export or purpose: a file exporting `PaddleCard` lives in `paddle-card.tsx`.
- Avoid generic names like `utils.ts`, `helpers.ts`, or `types.ts` — name the file after what it actually contains (`math.ts`, `paddle-viz.ts`).
- Group related files by colocation rather than by type: keep `foo.ts` and `foo.test.ts` together rather than separating source and tests into different directories.

### Callback Props

- Props: `on*` prefix
- Handlers: `handle*` prefix

```typescript
// ❌ Avoid
<Button click={actionClick} />

// ✅ Use
<Button onClick={handleClick} />
```

### Custom Hooks Return Value

Custom hooks should return objects, not arrays:

```typescript
// ❌ Avoid
const [products, errors] = useGetProducts();

// ✅ Use
const { products, errors } = useGetProducts();
```

### Abbreviations & Acronyms

Treat as whole words (only first letter capitalised):

```typescript
// ❌ Avoid
const FAQList = [];
const generateUserURL = () => {};

// ✅ Use
const FaqList = [];
const generateUserUrl = () => {};
```

### Comments

Favour expressive code over comments. Comments should explain "why," not "what."

```typescript
// ❌ Avoid
// convert to minutes
const m = s * 60;

// ✅ Use expressive names
const SECONDS_IN_MINUTE = 60;
const minutes = seconds * SECONDS_IN_MINUTE;

// ✅ Explain rationale
// TODO: Move filtering to backend once API v2 releases
const filteredUsers = frontendFiltering(selectedUsers);
```

---

## Source Organisation

### Code Collocation

- Organise files/folders by feature
- Collocate related code as close as possible

### Imports

- **Relative imports:** For files within the same feature
- **Absolute imports:** For all other cases

```typescript
// ❌ Avoid
import { bar } from '../../../../../../distant-folder';

// ✅ Use absolute for distant code
import { locationApi } from '@api/locationApi';

// ✅ Use relative within feature
import { baz } from './baz';
```

---

## React

### Required & Optional Props

**Make majority of props required.**

```typescript
// ❌ Avoid
type ButtonProps = { label?: string; onClick?: () => void };

// ✅ Use
type ButtonProps = { label: string; onClick: () => void };
```

### Props as Discriminated Type

```typescript
type StatusSuccess = { status: 'success'; data: Products; title: string };
type StatusLoading = { status: 'loading'; time: number };
type StatusError   = { status: 'error'; error: string };
type StatusProps   = StatusSuccess | StatusLoading | StatusError;

export const Status = (props: StatusProps) => {
  switch (props.status) {
    case 'success': return <div>{props.title}</div>;
    case 'loading': return <div>Loading {props.time}ms</div>;
    case 'error':   return <div>Error: {props.error}</div>;
  }
};
```

### Props To State

When initialising state from a prop, prefix the prop with `initial`:

```typescript
// ❌ Avoid
export const Foo = ({ productName }: { productName: string }) => {
  const [productName, setProductName] = useState(productName);
};

// ✅ Use
export const Foo = ({ initialProductName }: { initialProductName: string }) => {
  const [productName, setProductName] = useState(initialProductName);
};
```

### Props Type

Avoid `React.FC`. Annotate props with an inline type and let the return type be inferred:

```typescript
// ❌ Avoid
export const Foo: React.FC<FooProps> = ({ name }) => {};

// ✅ Use
type FooProps = { name: string };
export const Foo = ({ name }: FooProps) => {};
```

### Store & Pass Data

- Pass only necessary props; do not forward entire objects
- Consider props, URL state, or composition before reaching for global state
- Use React compound components for related components

---

## Tests

### What & How To Test

**Do:**
- Write short, explicit, intentional tests
- Follow AAA pattern (Arrange, Act, Assert)
- Write tests reflecting user behaviour and business logic
- Keep tests independent and isolated

**Don't:**
- Test implementation details
- Re-test library/framework functionality
- Test just for coverage metrics

### Test Description

Follow: `it('should ... when ...')`

```typescript
// ❌ Avoid
it('accepts ISO date format where date is parsed');

// ✅ Use
it('should return parsed date as YYYY-MM when input is ISO format');
```

### Snapshot Tests

Discourage snapshot testing. Exception: design system components with critical, stable output.
