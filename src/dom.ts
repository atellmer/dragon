import { ID, Pointer } from './types';

const CONTEXT_ID_ATTR = 'data-dnd-context-id';
const DROPPABLE_ID_ATTR = 'data-dnd-droppable-id';
const DRAGGABLE_ID_ATTR = 'data-dnd-draggable-id';

function setStyles(node: HTMLElement, style: Record<string, string | number>) {
  const namesMap = {
    zIndex: 'z-index',
    transformOrigin: 'transform-origin',
  };
  const keys = Object.keys(style);

  for (const key of keys) {
    const propertyName = namesMap[key] || key;
    const value = `${style[key]}`;

    node.style.setProperty(propertyName, value);
  }
}

function removeStyles(node: HTMLElement, keys: Array<string>) {
  for (const key of keys) {
    if (node.style.getPropertyValue(key)) {
      node.style.removeProperty(key);
    }
  }

  removeStyleAttrIfEmpty(node);
}

function getItemNodes(contextID: ID, droppableID: ID): Array<HTMLElement> {
  return Array.from(
    document.querySelectorAll(
      `[${CONTEXT_ID_ATTR}="${contextID}"][${DROPPABLE_ID_ATTR}="${droppableID}"][${DRAGGABLE_ID_ATTR}]`,
    ),
  );
}

function detectIsActiveDraggableNode(node: HTMLElement, activeDraggableID: ID) {
  return node.getAttribute(DRAGGABLE_ID_ATTR) === `${activeDraggableID}`;
}

function getActiveDraggableNode(contextID: number, activeDraggableID: ID) {
  return document.querySelector(`[${CONTEXT_ID_ATTR}="${contextID}"][${DRAGGABLE_ID_ATTR}="${activeDraggableID}"]`);
}

function getScrollContainer(node: HTMLElement): HTMLElement {
  let style = getComputedStyle(node);
  const excludeStaticParent = style.position === 'absolute';
  const overflowRegex = /(auto|scroll)/;

  if (style.position === 'fixed') return document.body;

  for (let parent = node; (parent = parent.parentElement); ) {
    style = getComputedStyle(parent);

    if (excludeStaticParent && style.position === 'static') {
      continue;
    }

    if (overflowRegex.test(style.overflow + style.overflowY + style.overflowX)) return parent;
  }

  return document.body;
}

function getScrollContainerFromContainer(node: HTMLElement): HTMLElement {
  const style = getComputedStyle(node);
  const overflowRegex = /(auto|scroll)/;

  if (overflowRegex.test(style.overflow + style.overflowY + style.overflowX)) {
    return node;
  }

  return getScrollContainer(node);
}

function getNodeSize(node: HTMLElement, rect: DOMRect) {
  const style = window.getComputedStyle(node);
  const marginTop = parseInt(style.marginTop);
  const marginBottom = parseInt(style.marginBottom);
  const marginRight = parseInt(style.marginRight);
  const marginLeft = parseInt(style.marginLeft);
  const nodeWidth = rect.width + marginLeft + marginRight;
  const nodeHeight = rect.height + marginTop + marginBottom;

  return {
    nodeWidth,
    nodeHeight,
  };
}

function getThreshold(rect: DOMRect, pointer: Pointer) {
  const { top, left } = rect;
  const thresholdY = top > 0 ? top : pointer.clientY < window.innerHeight / 2 ? 0 : window.innerHeight;
  const thresholdX = left > 0 ? left : pointer.clientX < window.innerWidth / 2 ? 0 : window.innerWidth;

  return {
    thresholdY,
    thresholdX,
  };
}

function blockScroll(node: HTMLElement) {
  const overflowValue = node.style.getPropertyValue('overflow');

  node.style.setProperty('overflow', 'hidden');

  return () => {
    if (overflowValue) {
      node.style.setProperty('overflow', overflowValue);
    } else {
      node.style.removeProperty('overflow');
    }

    removeStyleAttrIfEmpty(node);
  };
}

function removeStyleAttrIfEmpty(node: HTMLElement) {
  if (!node.getAttribute('style')) {
    node.removeAttribute('style');
  }
}

export {
  CONTEXT_ID_ATTR,
  DROPPABLE_ID_ATTR,
  DRAGGABLE_ID_ATTR,
  setStyles,
  removeStyles,
  getItemNodes,
  detectIsActiveDraggableNode,
  getActiveDraggableNode,
  getScrollContainer,
  getScrollContainerFromContainer,
  getNodeSize,
  getThreshold,
  blockScroll,
};
