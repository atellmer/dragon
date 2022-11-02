import React, { useRef, useLayoutEffect, useEffect, memo, useMemo, createContext, useContext } from 'react';

import { useDragDropContext } from './context';
import {
  CONTEXT_ID_ATTR,
  DROPPABLE_ID_ATTR,
  setStyles,
  removeStyles,
  getItemNodes,
  detectIsActiveDraggableNode,
  getActiveDraggableNode,
  getActiveDroppableNode,
  getScrollContainerFromContainer,
  safeNumber,
  getThreshold,
  debounce,
} from './utils';
import type { ID, Direction, Pointer } from './types';

export type DroppableProps = {
  direction: Direction;
  droppableID: ID;
  droppableGroupID: ID;
  transitionTimeout?: number;
  transitionTimingFn?: string;
  disabled?: boolean;
  debounceTimeout?: number;
  children: (options: DroppableChildrenOptions) => React.ReactElement;
  onDragOver?: (options: OnDragOverOptions) => void;
};

const Droppable: React.FC<DroppableProps> = memo(props => {
  const {
    droppableID,
    droppableGroupID,
    direction,
    transitionTimeout,
    transitionTimingFn,
    debounceTimeout,
    disabled,
    children,
    onDragOver,
  } = props;
  const { state, mergeState, resetState, onDragEnd } = useDragDropContext();
  const {
    isDragging: isSomeDragging,
    contextID,
    nodeWidth,
    nodeHeight,
    activeDraggableID,
    activeDroppableID,
    activeDroppableGroupID,
    unsubscribers,
    onInsertPlaceholder,
  } = state;
  const isActiveGroup = !disabled && droppableGroupID === activeDroppableGroupID;
  const isActive = isActiveGroup && droppableID === activeDroppableID;
  const isDragging = isSomeDragging && isActive;
  const rootRef = useRef<HTMLElement>(null);
  const nearestNodeRef = useRef<HTMLElement>(null);
  const scope = useMemo<DroppableScope>(() => ({ removePlaceholder: () => {} }), []);
  const nodes = useMemo(() => (rootRef.current ? getItemNodes(contextID, droppableID) : []), [isDragging]);

  const handleDragEnd = (targetNode: HTMLElement) => {
    const sourceIdx = nodes.findIndex(x => detectIsActiveDraggableNode(x, activeDraggableID));
    const targetRect = targetNode.getBoundingClientRect();
    const isMoving = sourceIdx === -1;
    let destinationIdx = 0;

    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      const map: Record<DroppableProps['direction'], () => void> = {
        vertical: () => {
          if (targetRect.top + targetRect.height > rect.top + rect.height) {
            destinationIdx++;
          }
        },
        horizontal: () => {
          if (targetRect.left + targetRect.width > rect.left + rect.width) {
            destinationIdx++;
          }
        },
      };

      map[direction]();
    }

    setTimeout(() => {
      scope.removePlaceholder();
      nodes.forEach(x => removeStyles(x, ['transition', 'transform']));
      resetState();
    });

    onDragEnd({
      draggableID: activeDraggableID,
      droppableID,
      droppableGroupID,
      sourceIdx,
      destinationIdx,
      isMoving,
      targetNode,
    });
  };

  useEffect(() => {
    if (isDragging) return;
    setTimeout(() => {
      nodes.forEach(x => {
        const isActive = detectIsActiveDraggableNode(x, activeDraggableID);

        !isActive && removeStyles(x, ['transition', 'transform']);
      });
    });
  }, [isDragging]);

  useIntersectionEffect({
    contextID,
    activeDraggableID,
    activeDroppableID,
    isActiveGroup,
    isActive,
    isSomeDragging,
    debounceTimeout,
    rootNode: rootRef.current,
    unsubscribers,
    onIntersect: () => {
      mergeState({
        activeDroppableID: droppableID,
        scrollContainer: getScrollContainerFromContainer(rootRef.current),
        onInsertPlaceholder: () => {},
      });
    },
  });

  usePlaceholderEffect({
    isDragging,
    nodeWidth,
    nodeHeight,
    container: rootRef.current,
    scope,
    onInsertPlaceholder,
  });

  useMoveSensorEffect({
    isDragging,
    unsubscribers,
    transformNodesByTargetOptions: {
      direction,
      nodes,
      activeDraggableID,
      nodeHeight,
      nodeWidth,
      transitionTimeout,
      transitionTimingFn,
      onMarkNearestNode: (nearestNode, targetNode) => {
        nearestNodeRef.current = nearestNode || null;
        onDragOver({ nearestNode, targetNode });
      },
    },
  });

  useMoveEndSensorEffect({
    direction,
    isDragging,
    contextID,
    activeDraggableID,
    activeDroppableID,
    nearestNodeRef,
    transitionTimeout,
    unsubscribers,
    onDragEnd: handleDragEnd,
  });

  const contextValue = useMemo<DroppableContextValue>(
    () => ({
      direction,
      droppableID,
      droppableGroupID,
      disabled,
    }),
    [direction, droppableID, droppableGroupID, disabled],
  );

  return (
    <DroppableContext.Provider value={contextValue}>
      {children({
        ref: rootRef,
        [CONTEXT_ID_ATTR]: contextID,
        [DROPPABLE_ID_ATTR]: droppableID,
        snapshot: {
          isDragging,
        },
        onDragStart: defaultHandleDragStart,
      })}
    </DroppableContext.Provider>
  );
});

Droppable.defaultProps = {
  transitionTimeout: 200,
  transitionTimingFn: 'ease-in-out',
  debounceTimeout: 0,
  onDragOver: () => {},
};

type DroppableScope = {
  removePlaceholder: () => void;
};

type DroppableContextValue = {} & Pick<DroppableProps, 'direction' | 'droppableID' | 'droppableGroupID' | 'disabled'>;

const DroppableContext = createContext<DroppableContextValue>(null);

function useDroppableContext() {
  return useContext(DroppableContext);
}

const defaultHandleDragStart = (e: React.MouseEvent) => e.preventDefault();

export type DroppableChildrenOptions = {
  ref: React.Ref<any>;
  [CONTEXT_ID_ATTR]: number;
  [DROPPABLE_ID_ATTR]: ID;
  snapshot: {
    isDragging: boolean;
  };
  onDragStart: React.DragEventHandler;
};

export type OnDragOverOptions = {
  nearestNode: HTMLElement | null;
  targetNode: HTMLElement;
};

type UseIntersectionEffectOptions = {
  isSomeDragging: boolean;
  isActiveGroup: boolean;
  isActive: boolean;
  rootNode: HTMLElement;
  contextID: number;
  activeDroppableID: ID;
  activeDraggableID: ID;
  debounceTimeout: number;
  unsubscribers: Array<() => void>;
  onIntersect: () => void;
};

function useIntersectionEffect(options: UseIntersectionEffectOptions) {
  const {
    isSomeDragging,
    isActiveGroup,
    isActive,
    rootNode,
    contextID,
    activeDroppableID,
    activeDraggableID,
    debounceTimeout = 0,
    unsubscribers,
    onIntersect,
  } = options;

  useEffect(() => {
    if (!isSomeDragging) return;
    const handleEvent = debounce(() => {
      if (!isSomeDragging) return;
      if (!isActiveGroup) return;
      if (isActive) return;
      const draggableNode = getActiveDraggableNode(contextID, activeDraggableID);
      const droppableRect = rootNode.getBoundingClientRect();
      const draggableRect = draggableNode.getBoundingClientRect();
      const draggableRectTop = safeNumber(draggableRect.top);
      const draggableRectLeft = safeNumber(draggableRect.left);
      const droppableRectTop = safeNumber(droppableRect.top);
      const droppableRectLeft = safeNumber(droppableRect.left);
      const droppableRectHeight = safeNumber(droppableRect.height);
      const droppableRectWidth = safeNumber(droppableRect.width);
      const isYaxesIntersected =
        draggableRectTop > droppableRectTop && draggableRectTop < droppableRectTop + droppableRectHeight;
      const isXaxesIntersected =
        draggableRectLeft > droppableRectLeft && draggableRectLeft < droppableRectLeft + droppableRectWidth;

      if (isYaxesIntersected && isXaxesIntersected) {
        onIntersect();
      }
    }, debounceTimeout);

    document.addEventListener('mousemove', handleEvent);
    document.addEventListener('touchmove', handleEvent);

    const unsubscribe = () => {
      document.removeEventListener('mousemove', handleEvent);
      document.removeEventListener('touchmove', handleEvent);
    };

    unsubscribers.push(unsubscribe);

    return () => unsubscribe();
  }, [isSomeDragging, activeDroppableID, rootNode]);
}

type UsePlaceholderEffectOptions = {
  isDragging: boolean;
  nodeWidth: number;
  nodeHeight: number;
  container: HTMLElement;
  scope: DroppableScope;
  onInsertPlaceholder: () => void;
};

function usePlaceholderEffect(options: UsePlaceholderEffectOptions) {
  const { isDragging, nodeWidth, nodeHeight, container, scope, onInsertPlaceholder } = options;

  useLayoutEffect(() => {
    let placeholder: HTMLDivElement = null;

    if (isDragging) {
      placeholder = document.createElement('div');

      scope.removePlaceholder = () => {
        placeholder.parentElement.removeChild(placeholder);
        scope.removePlaceholder = () => {};
      };

      setStyles(placeholder, {
        width: `${nodeWidth}px`,
        height: `${nodeHeight}px`,
        flex: `0 0 auto`,
      });

      container.appendChild(placeholder);
      onInsertPlaceholder();
    }

    return () => scope.removePlaceholder();
  }, [isDragging]);
}

type UseMoveSensorEffectOptions = {
  isDragging: boolean;
  unsubscribers: Array<() => void>;
  transformNodesByTargetOptions: Omit<TransformNodesByTargetOptions, 'target' | 'pointer'>;
};

function useMoveSensorEffect(options: UseMoveSensorEffectOptions) {
  const { isDragging, unsubscribers, transformNodesByTargetOptions } = options;

  useLayoutEffect(() => {
    if (!isDragging) return;

    const handleEvent = debounce((e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      const pointer: Pointer =
        e instanceof MouseEvent
          ? { clientX: e.clientX, clientY: e.clientY }
          : e instanceof TouchEvent
          ? { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
          : null;

      transformNodesByTarget({
        ...transformNodesByTargetOptions,
        target,
        pointer,
      });
    });

    document.addEventListener('mousemove', handleEvent);
    document.addEventListener('touchmove', handleEvent);

    const unsubscribe = () => {
      document.removeEventListener('mousemove', handleEvent);
      document.removeEventListener('touchmove', handleEvent);
    };

    unsubscribers.push(unsubscribe);

    return () => unsubscribe();
  }, [isDragging]);
}

type UseMoveEndSensorEffectOptions = {
  direction: Direction;
  isDragging: boolean;
  contextID: number;
  activeDraggableID: ID;
  activeDroppableID: ID;
  nearestNodeRef: React.MutableRefObject<HTMLElement>;
  transitionTimeout: number;
  unsubscribers: Array<() => void>;
  onDragEnd: (node: HTMLElement) => void;
};

function useMoveEndSensorEffect(options: UseMoveEndSensorEffectOptions) {
  const {
    direction,
    isDragging,
    contextID,
    activeDraggableID,
    activeDroppableID,
    nearestNodeRef,
    transitionTimeout,
    unsubscribers,
    onDragEnd,
  } = options;

  useLayoutEffect(() => {
    if (!isDragging) return;

    const handleEvent = () => {
      unsubscribers.forEach(fn => fn());
      unsubscribers.splice(0, unsubscribers.length);

      const nearestNode = nearestNodeRef.current || null;
      const hasTransform = nearestNode && window.getComputedStyle(nearestNode).transform !== 'none';

      const applyTransition = () => {
        const targetNode = getActiveDraggableNode(contextID, activeDraggableID);

        applyTargetNodeTransition({
          direction,
          contextID,
          activeDroppableID,
          targetNode,
          nearestNode,
          transitionTimeout,
          onComplete: onDragEnd,
        });
      };

      if (nearestNode && hasTransform) {
        const handleTransitionEnd = (e: globalThis.TransitionEvent) => {
          if (e.target === nearestNode && e.propertyName === 'transform') {
            nearestNode.removeEventListener('transitionend', handleTransitionEnd);
            applyTransition();
          }
        };

        nearestNode.addEventListener('transitionend', handleTransitionEnd);
      } else {
        applyTransition();
      }
    };

    document.addEventListener('mouseup', handleEvent);
    document.addEventListener('touchend', handleEvent);

    const unsubscribe = () => {
      document.removeEventListener('mouseup', handleEvent);
      document.removeEventListener('touchend', handleEvent);
    };

    unsubscribers.push(unsubscribe);

    return () => unsubscribe();
  }, [isDragging]);
}

type ApplyTargetNodeTransitionOptions = {
  direction: Direction;
  contextID: number;
  activeDroppableID: ID;
  targetNode: HTMLElement;
  nearestNode: HTMLElement | null;
  transitionTimeout: number;
  onComplete: (targetNode: HTMLElement) => void;
};

const applyTargetNodeTransition = (options: ApplyTargetNodeTransitionOptions) => {
  const { direction, contextID, activeDroppableID, targetNode, nearestNode, transitionTimeout, onComplete } = options;
  const targetNodeStyle = window.getComputedStyle(targetNode);
  const hasTransform = targetNodeStyle.transform !== 'none';
  const isVertical = direction === 'vertical';
  const { droppableTop, droppableLeft } = getDroppableContainerOffsets();

  function getDroppableContainerOffsets() {
    const droppableNode = getActiveDroppableNode(contextID, activeDroppableID);
    const { top, left } = droppableNode.getBoundingClientRect();
    const style = window.getComputedStyle(droppableNode);
    const paddingTop = parseInt(style.paddingTop, 10);
    const paddingLeft = parseInt(style.paddingLeft, 10);
    const droppableTop = safeNumber(top + paddingTop);
    const droppableLeft = safeNumber(left + paddingLeft);

    return { droppableTop, droppableLeft };
  }

  const getVerticalDirectionOffset = () => {
    if (nearestNode) {
      const { bottom } = nearestNode.getBoundingClientRect();
      const marginTop = parseInt(targetNodeStyle.marginTop, 10);

      return safeNumber(bottom + marginTop);
    }

    return droppableTop;
  };

  const getHorizontalDirectionOffset = () => {
    if (nearestNode) {
      const { left, width } = nearestNode.getBoundingClientRect();
      const marginLeft = parseInt(targetNodeStyle.marginLeft, 10);

      return safeNumber(left + width + marginLeft);
    }

    return droppableTop;
  };

  const offset = isVertical ? getVerticalDirectionOffset() : getHorizontalDirectionOffset();

  if (hasTransform) {
    const styles = {
      transition: `transform ${transitionTimeout}ms ease-in-out, top ${transitionTimeout}ms ease-in-out, left ${transitionTimeout}ms ease-in-out`,
      transform: `translate3D(0, 0, 0)`,
      top: undefined,
      left: undefined,
    };

    if (isVertical) {
      styles.top = `${offset}px`;
      styles.left = `${droppableLeft}px`;
    } else {
      styles.top = `${droppableTop}px`;
      styles.left = `${offset}px`;
    }

    setStyles(targetNode, styles);

    setTimeout(() => {
      onComplete(targetNode);
    }, transitionTimeout);
  } else {
    onComplete(targetNode);
  }
};

type TransformNodesByTargetOptions = {
  direction: Direction;
  target: HTMLElement;
  pointer: Pointer;
  nodes: Array<HTMLElement>;
  activeDraggableID: ID;
  nodeHeight: number;
  nodeWidth: number;
  transitionTimeout?: number;
  transitionTimingFn?: string;
  onMarkNearestNode?: (nearestNode: HTMLElement, targetNode: HTMLElement) => void;
};

const transformNodesByTarget = (options: TransformNodesByTargetOptions) => {
  const {
    direction,
    target,
    pointer,
    nodes,
    activeDraggableID,
    nodeHeight,
    nodeWidth,
    transitionTimeout = 0,
    transitionTimingFn = '',
    onMarkNearestNode = () => {},
  } = options;
  const targetRect = target.getBoundingClientRect();
  let nearestNode: HTMLElement = null;
  let minimalDiff = Infinity;
  const fns: Array<() => void> = [];

  for (const node of nodes) {
    if (detectIsActiveDraggableNode(node, activeDraggableID)) continue;
    const rect = node.getBoundingClientRect();
    const top = safeNumber(rect.top);
    const left = safeNumber(rect.left);
    const { thresholdY, thresholdX } = getThreshold(targetRect, pointer);
    const map: Record<Direction, () => void> = {
      vertical: () => {
        if (thresholdY <= top) {
          setStyles(node, {
            transition: `transform ${transitionTimeout}ms ${transitionTimingFn}`,
            transform: `translate3d(0px, ${nodeHeight}px, 0px)`,
          });
        } else {
          removeStyles(node, ['transform']);

          const diff = safeNumber(thresholdY - top);

          if (diff < minimalDiff) {
            minimalDiff = diff;
            nearestNode = node;
          }
        }
      },
      horizontal: () => {
        if (thresholdX <= left) {
          setStyles(node, {
            transition: `transform ${transitionTimeout}ms ${transitionTimingFn}`,
            transform: `translate3d(${nodeWidth}px, 0px, 0px)`,
          });
        } else {
          removeStyles(node, ['transform']);

          const diff = safeNumber(thresholdX - left);

          if (diff < minimalDiff) {
            minimalDiff = diff;
            nearestNode = node;
          }
        }
      },
    };

    fns.push(map[direction]);
  }

  // read first getBoundingClientRect in loop, then change styles to improve performance
  fns.forEach(fn => fn());

  onMarkNearestNode(nearestNode, target);
};

export { Droppable, useDroppableContext, transformNodesByTarget };
