# Accessibility Audit Checklist

This checklist helps ensure the application meets WCAG 2.1 AA standards.

## ARIA Labels

- [ ] All interactive elements have accessible names
- [ ] Form inputs have associated labels
- [ ] Buttons have descriptive text or aria-label
- [ ] Icons have aria-label or aria-hidden="true"
- [ ] Images have alt text
- [ ] Decorative images have empty alt text

## Heading Hierarchy

- [ ] Page has one h1
- [ ] Headings are in logical order (h1 → h2 → h3)
- [ ] No skipped heading levels
- [ ] Headings describe content sections

## Focus Management

- [ ] All interactive elements are keyboard accessible
- [ ] Focus indicators are visible
- [ ] Tab order is logical
- [ ] Skip links are available
- [ ] Modal dialogs trap focus
- [ ] Focus returns to trigger after closing modal

## ARIA Live Regions

- [ ] Dynamic content updates use aria-live
- [ ] Error messages are announced
- [ ] Success messages are announced
- [ ] Loading states are announced

## Color and Contrast

- [ ] Text meets WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
- [ ] Color is not the only means of conveying information
- [ ] Interactive elements have sufficient contrast
- [ ] Focus indicators have sufficient contrast

## Keyboard Navigation

- [ ] All functionality available via keyboard
- [ ] No keyboard traps
- [ ] Escape key closes modals/dialogs
- [ ] Enter/Space activates buttons
- [ ] Arrow keys work in menus/lists

## Screen Reader Support

- [ ] Page structure is announced correctly
- [ ] Form errors are announced
- [ ] Dynamic content changes are announced
- [ ] Landmarks are used (header, nav, main, footer)

## Forms

- [ ] All inputs have labels
- [ ] Required fields are indicated
- [ ] Error messages are associated with inputs
- [ ] Error messages are descriptive
- [ ] Form validation is accessible

## Images

- [ ] All images have alt text
- [ ] Decorative images have empty alt
- [ ] Complex images have long descriptions
- [ ] Images of text are avoided

## Links

- [ ] Link text is descriptive
- [ ] Links are distinguishable from text
- [ ] External links are indicated
- [ ] Link purpose is clear from context

## Tables

- [ ] Tables have headers
- [ ] Headers are associated with cells
- [ ] Complex tables have captions
- [ ] Tables are responsive

## Testing Tools

- [ ] Tested with screen reader (NVDA/JAWS/VoiceOver)
- [ ] Tested with keyboard only
- [ ] Tested with browser zoom (200%)
- [ ] Used automated tools (axe, WAVE, Lighthouse)

## Implementation Notes

### Current Status

- ✅ Skip links implemented
- ✅ Bidirectional text support
- ✅ Form labels implemented
- ✅ Focus management in modals
- ⚠️ ARIA live regions - needs review
- ⚠️ Color contrast - needs verification

### Next Steps

1. Run automated accessibility tests
2. Manual testing with screen readers
3. Fix identified issues
4. Document accessibility features

