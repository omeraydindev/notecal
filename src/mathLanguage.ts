import { StreamLanguage, type StringStream } from '@codemirror/language';

// Define the math notation language
const mathNotation = {
  startState() {
    return { inBlockComment: false };
  },

  token(stream: StringStream, state: { inBlockComment: boolean }) {
    if (state.inBlockComment) {
      if (stream.match(/^.*?\*\//)) {
        state.inBlockComment = false;
      } else {
        stream.skipToEnd();
      }
      return 'comment';
    }

    // Comments
    if (stream.match(/^\/\/.*/)) {
      return 'comment';
    }

    if (stream.match(/^\/\*.*?\*\//)) {
      return 'comment';
    }

    if (stream.match(/^\/\*.*/)) {
      state.inBlockComment = true;
      return 'comment';
    }

    // Numbers with optional decimal points and shorthand multipliers (k, m, b)
    if (stream.match(/^\d+\.?\d*[kmb]?\b/i)) {
      return 'number';
    }

    // Math functions (sqrt, sin, cos, tan, log, etc.)
    if (stream.match(/^(sqrt|sin|cos|tan|log|ln|exp|abs|ceil|floor|round|min|max|pow)\b/i)) {
      return 'function';
    }

    // Units (deg, rad, etc.)
    if (stream.match(/^(deg|rad)\b/i)) {
      return 'unit';
    }

    // Operators
    if (stream.match(/^[+\-*/^=()]/)) {
      return 'operator';
    }

    // Variable names (alphanumeric, starting with letter or underscore)
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
      return 'variableName';
    }

    // Skip whitespace
    if (stream.match(/^\s+/)) {
      return null;
    }

    // Default: consume one character
    stream.next();
    return null;
  },
};

// Create the language extension
export const mathLanguageExtension = StreamLanguage.define(mathNotation);

