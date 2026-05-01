import React, { forwardRef } from 'react';
import { classNames } from '../utils/helpers';

const Input = forwardRef(({
  label,
  error,
  helperText,
  required = false,
  disabled = false,
  className = '',
  type = 'text',
  placeholder,
  value,
  onChange,
  onBlur,
  ...props
}, ref) => {
  const inputClasses = classNames(
    'input w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-agilbank-primary focus:border-transparent transition-colors',
    error ? 'border-red-300 focus:ring-red-500' : 'border-gray-300',
    disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white',
    className
  );

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <input
        ref={ref}
        type={type}
        className={inputClasses}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        {...props}
      />
      
      {error && (
        <p className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      
      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500">
          {helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
