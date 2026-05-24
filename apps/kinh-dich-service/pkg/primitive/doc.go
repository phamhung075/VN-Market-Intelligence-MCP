// Package primitive contains pure function primitives for Kinh Dich hexagram computation.
// Each sub-package (hao_encoder, hexagram_resolver, ngu_hanh_classifier, reading_scorer,
// nuclear_hexagram) is a pure function package with zero I/O and stdlib-only imports.
//
// Fence-A rule: pkg/primitive/* must NOT import pkg/domain/, pkg/application/,
// pkg/infrastructure/, pkg/interface/, or pkg/module/.
// Exception: Sister primitive imports (e.g., nuclear_hexagram imports hexagram_resolver)
// are allowed per OQ-6.
package primitive
