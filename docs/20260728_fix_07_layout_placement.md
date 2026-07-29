# Issue 7 Fix: Configuration placement does not match requested layout

**Date:** 2026-07-28  
**Priority:** MEDIUM  
**Status:** Fixed

## Problem

`PreparePage.tsx:228` places the ExceptionColumnPicker *after* the Rules section
in a separate `config-layout` div with an empty right column (`<div />`). The
requirement says it should be a sibling of "Compare and Validate" and
"Validation Rules" sections, sharing the two-column layout with the config
loader/saver on the right.

## Fix

Moved the `ExceptionColumnPicker` into the first `config-layout` div, as a
sibling of the section heading inside the left column. This places it alongside
the heading text and the `ConfigManager` on the right in the standard two-column
layout, matching the pattern used by the "Compare & validate" section.
