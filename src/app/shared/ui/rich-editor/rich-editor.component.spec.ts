import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RichEditorComponent } from './rich-editor.component';

/**
 * Logic-only tests for the Quill wrapper. The template (which renders the heavy
 * <p-editor>) is overridden away, matching the project convention; we exercise
 * the ControlValueAccessor contract directly to prove form binding is preserved
 * after moving Quill behind this wrapper.
 */
interface CvaFields {
  value: string | null;
  disabled: boolean;
  onTouched: () => void;
  onEditorChange(html: string | null): void;
}

describe('RichEditorComponent', () => {
  let component: RichEditorComponent;

  const access = (c: RichEditorComponent) => c as unknown as CvaFields;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RichEditorComponent],
      providers: [provideNoopAnimations()],
    })
      .overrideComponent(RichEditorComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    component = TestBed.createComponent(RichEditorComponent).componentInstance;
  });

  it('writeValue stores the html for the inner editor', () => {
    component.writeValue('<p>hello</p>');
    expect(access(component).value).toBe('<p>hello</p>');
  });

  it('writeValue normalises null/undefined to null', () => {
    component.writeValue(null);
    expect(access(component).value).toBeNull();
  });

  it('forwards editor changes to the registered onChange', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    access(component).onEditorChange('<p>edited</p>');
    expect(onChange).toHaveBeenCalledWith('<p>edited</p>');
  });

  it('propagates the empty value (null) on clear, like p-editor does', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    // p-editor emits htmlValue === null when the editor is emptied.
    access(component).onEditorChange(null);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('does not echo the change back into the editor value (caret safety)', () => {
    component.writeValue('<p>start</p>');
    access(component).onEditorChange('<p>typed</p>');
    // value is only set by writeValue, never by the keystroke handler.
    expect(access(component).value).toBe('<p>start</p>');
  });

  it('marks touched on selection change', () => {
    const onTouched = vi.fn();
    component.registerOnTouched(onTouched);
    access(component).onTouched();
    expect(onTouched).toHaveBeenCalled();
  });

  it('reflects the disabled state', () => {
    component.setDisabledState(true);
    expect(access(component).disabled).toBe(true);
    component.setDisabledState(false);
    expect(access(component).disabled).toBe(false);
  });
});
