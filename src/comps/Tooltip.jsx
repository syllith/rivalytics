import React, { useState, cloneElement } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  arrow as arrowMiddleware,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingArrow
} from '@floating-ui/react';
import { Box } from '@mui/material';

const Tooltip = ({ 
  children, 
  content, 
  placement = 'top',
  delay = [1000, 0],
  disabled = false,
  ...props 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const arrowRef = React.useRef(null);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(12),
      flip(),
      shift({ padding: 8 }),
      arrowMiddleware({ element: arrowRef })
    ],
  });

  const hover = useHover(context, {
    delay: typeof delay === 'number' ? delay : { open: delay[0], close: delay[1] },
    enabled: !disabled
  });
  
  const focus = useFocus(context, {
    enabled: !disabled
  });
  
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  // Animation state
  const [show, setShow] = useState(false);
  const [isPositioned, setIsPositioned] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  
  React.useEffect(() => {
    if (isOpen) {
      // Wait longer for positioning to be calculated before showing
      const timeout = setTimeout(() => {
        setIsPositioned(true);
        setShow(true);
        // Start animation after position is ready
        const animateTimeout = setTimeout(() => setShouldAnimate(true), 32); // Slightly longer
        return () => clearTimeout(animateTimeout);
      }, 64); // Three+ frame delay to ensure positioning is ready
      return () => clearTimeout(timeout);
    } else {
      setShouldAnimate(false);
      setIsPositioned(false);
      const timeout = setTimeout(() => setShow(false), 120);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  return (
    <>
      {cloneElement(children, {
        ref: refs.setReference,
        ...getReferenceProps(),
        ...children.props
      })}
      {isPositioned && (isOpen || show) && (
        <FloatingPortal>
          <Box
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            sx={{
              backgroundColor: 'rgba(24, 24, 28, 0.92)',
              color: 'white',
              padding: '8px 14px',
              borderRadius: '7px',
              fontSize: '13px', // Smaller font size
              fontWeight: 400,
              maxWidth: '320px',
              wordWrap: 'break-word',
              zIndex: 9999,
              boxShadow: '0 6px 24px 0 rgba(0,0,0,0.18)',
              border: '1px solid rgba(255,255,255,0.10)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              opacity: shouldAnimate && isOpen ? 1 : 0,
              transform: shouldAnimate && isOpen ? 'scale(1)' : 'scale(0.96)',
              transition: 'opacity 120ms cubic-bezier(.4,0,.2,1), transform 120ms cubic-bezier(.4,0,.2,1)',
              pointerEvents: isOpen ? 'auto' : 'none',
              ...props.sx
            }}
          >
            <FloatingArrow
              ref={arrowRef}
              context={context}
              width={16}
              height={8}
              fill="rgba(24, 24, 28, 0.92)"
              stroke="rgba(255,255,255,0.10)"
              strokeWidth={1}
            />
            {content}
          </Box>
        </FloatingPortal>
      )}
    </>
  );
};

export default Tooltip;
