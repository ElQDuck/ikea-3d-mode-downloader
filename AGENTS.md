# Agent Guidelines for ikea-3d-mode-downloader

## Build, Lint, and Test Commands

### Dependency Management
- Install dependencies: `npm install`
- Update dependencies: `npm update`
- Check for outdated packages: `npm outdated`

### Build Commands
- For TypeScript projects: `npm run build` or `tsc`
- For production builds: `npm run build:prod`
- To start development server: `npm run dev` or `npm start`

### Linting Commands
- Run ESLint: `npm run lint` or `eslint . --ext .ts,.tsx,.js,.jsx`
- Fix ESLint issues: `npm run lint:fix` or `eslint . --ext .ts,.tsx,.js,.jsx --fix`
- Run Stylelint: `npm run stylelint` or `stylelint "**/*.{css,scss}"`
- Fix Stylelint issues: `npm run stylelint:fix` or `stylelint "**/*.{css,scss}" --fix`
- Run all linters: `npm run lint:all`

### Testing Commands
- Run all tests: `npm test` or `jest`
- Run tests in watch mode: `npm run test:watch` or `jest --watch`
- Run a single test file: `npm test -- path/to/testFile.test.ts`
- Run a single test function: `npm test -- -t "test function name"`
- Run tests with coverage: `npm run test:cov` or `jest --coverage`
- Run specific test suite: `npm test -- path/to/testSuite/`

### Type Checking
- TypeScript type checking: `npm run typecheck` or `tsc --noEmit`
- Watch for type errors: `npm run typecheck:watch` or `tsc --noEmit --watch`

## Code Style Guidelines

### TypeScript/JavaScript

#### Formatting
- Use 2 spaces for indentation (no tabs)
- Maximum line length: 250 characters
- Semicolons: not Required
- Quotes: Single quotes for strings, except when escaping
- Template literals: Use backticks for multi-line strings and interpolation
- Trailing commas: ES5 style (no trailing commas in function calls, but allowed in object/array literals and function parameters)
- Curly braces: Always use braces for control structures (if, for, while, etc.)
- Arrow functions: Prefer arrow functions for anonymous functions, especially when returning a single expression

#### Imports
- Order imports: 
  1. Built-in Node modules (if applicable)
  2. External libraries (sorted alphabetically)
  3. Internal modules (sorted by path)
- No unused imports allowed
- Use path aliases when configured (e.g., `@components/button`)
- Relative imports: Use `./` for current directory, `../` for parent

#### Types and Interfaces
- Prefer interfaces for object shapes, types for unions/intersections
- Name interfaces without 'I' prefix (e.g., `UserOptions` not `IUserOptions`)
- Use explicit return types for functions (except arrow functions with simple returns)
- Avoid `any` type; use `unknown` when type is truly unknown and then narrow
- Mark optional properties with `?`
- Use `readonly` for arrays and objects that shouldn't be modified
- Use `enum` for constant sets of strings/numbers

#### Naming Conventions
- Files: camelCase for TS/TSX, kebab-case for CSS/HTML
- Variables/functions: camelCase
- Classes/Interfaces/Types: PascalCase
- Constants: UPPER_SNAKE_CASE
- Private properties/methods: Prefix with underscore (_) only if truly private (not just convention)
- Boolean variables: Use is/has/can prefixes (e.g., `isVisible`, `hasData`)
- Functions: Use verb-first naming (e.g., `calculateTotal`, `fetchData`)

#### Error Handling
- Use try/catch for asynchronous operations and promises
- For async/await: wrap in try/catch blocks
- Never leave empty catch blocks; at least log the error
- Create custom error classes for domain-specific errors
- Validate inputs at function boundaries
- Use optional chaining (?.) and nullish coalescing (??) for safe property access
- Throw errors with descriptive messages

#### React-Specific (if applicable)
- Functional components preferred over class components
- Use hooks consistently; don't call hooks in loops/conditions
- Component names: PascalCase, match filename
- Props: Use interfaces/types for prop definitions
- Event handlers: Prefix with 'handle' (e.g., `handleClick`, `handleChange`)
- State variables: Use descriptive names with useState hook
- Keys in lists: Use stable IDs, not array indices when order may change

### HTML

#### Formatting
- Indentation: 2 spaces
- Tag names: lowercase
- Attribute names: lowercase, use kebab-case
- Attribute values: always quoted with double quotes
- Self-closing tags: include space before slash (e.g., `<br />`)
- Line length: maximum 120 characters
- Close all tags (void elements are exception)

#### Structure
- Doctype: `<!DOCTYPE html>` at top
- Lang attribute on html element
- Meta charset: `<meta charset="UTF-8">`
- Viewport meta tag for responsive design
- Semantic elements: Use header, nav, main, section, article, footer, etc.
- Accessibility: Always include alt text for images, labels for inputs
- Avoid inline styles; use CSS classes instead
- Scripts: Place at bottom of body or use defer/async attributes

### CSS/SCSS

#### Formatting
- Indentation: 2 spaces
- Selectors: each on new line for multiple selectors
- Opening brace: same line as selector, space before brace
- Closing brace: on its own line, same indentation as selector
- Properties: each on new line, indented
- Property format: `property: value;` (space after colon)
- Line length: maximum 120 characters
- End with newline

#### Naming Conventions
- Classes: kebab-case
- IDs: kebab-case (use sparingly)
- Custom properties (CSS variables): kebab-case, prefixed with `--`
- BEM methodology recommended: 
  - Block: `.button`
  - Element: `.button__icon`
  - Modifier: `.button--primary`
- Utility classes: prefix with `u-` (e.g., `u-text-center`)
- State classes: prefix with `is-` or `has-` (e.g., `is-active`, `has-error`)

#### Style Organization
- Order properties alphabetically or by type (positioning, box model, typography, visual, misc)
- Use CSS custom properties for theme values (colors, spacing, fonts)
- Prefer relative units (rem, em, %) over pixels for responsive design
- Use flexbox or grid for layouts; avoid floats when possible
- Z-index: use layers with named constants if needed
- Comments: Use for section breaks and explaining non-obvious decisions
- Avoid !important except for utility classes or overriding inline styles

#### Preprocessors (if using SCSS)
- Nesting: maximum depth of 3 levels
- @extend: use sparingly, prefer mixins for reuse
- Mixins: name in kebab-case, use for vendor prefixes and complex patterns
- Variables: use for colors, fonts, breakpoints, z-indexes
- Functions: use for calculations and value transformations
- Partials: name with leading underscore (e.g., `_variables.scss`)
- Import order: 
  1. Variables, functions, mixins
  2. Base/reset styles
  3. Components
  4. Utilities
  5. Themes/overrides

### General Principles

#### Documentation
- JSDoc for all public functions and classes
- Comment complex logic, not obvious code
- README: keep updated with setup and usage instructions
- TODO comments: include ticket/reference if applicable

#### Git Practices
- Commit messages: conventional format (feat:, fix:, docs:, etc.)
- Small, focused commits
- Pull requests: descriptive title and description
- Branch naming: feature/, bugfix/, release/, hotfix/

#### Performance
- Bundle size: monitor and optimize
- Lazy load components and routes when applicable
- Optimize images (size, format, lazy loading)
- Minimize DOM manipulations
- Use requestAnimationFrame for animations
- Debounce/throttle expensive operations (resize, scroll)

#### Security
- Sanitize user inputs to prevent XSS
- Use textContent instead of innerHTML when possible
- Implement Content Security Policy (CSP)
- Validate file uploads (type, size)
- Use HTTPS in production
- Keep dependencies updated

## Tool-Only File Generation
- **DO NOT** manually create or edit the following files: `package-lock.json`, `node_modules/`, `dist/`, or `.build/`.
- **ENFORCEMENT:** If a dependency change is needed, the @developer MUST run `npm install [package]` via the `bash` tool. 
- The agent is forbidden from using `write_file` or `patch_file` on any lockfiles.

## File & Artifact Management
- **STRICT ROOT CLEANLINESS:** Do not create any Markdown (.md) or status files in the repository root.
- **MANDATORY OUTPUT DIRECTORY:** All task reports, phase logs, test results, and temporary documentation MUST be written to `.opencode/out/`.
- **NAMING CONVENTION:** Use lowercase, kebab-case for these files (e.g., `.opencode/out/phase-2.md` instead of `PHASE_2_.md`).
- **CLEANUP:** Any file created during a task that is not part of the source code must be deleted or moved to `.opencode/out/` before finishing.