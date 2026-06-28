// Browser page-translation (Chrome/Brave "Translate this page", and some extensions)
// swaps text nodes out from under React. When React later re-renders and tries to
// remove or move those nodes, removeChild/insertBefore throw
// "NotFoundError: ... not a child of this node" and crash the whole tree (the user
// then sees the error boundary). Guard the two native methods so that exact case is a
// graceful no-op instead of a throw. Translation keeps working; React stops crashing.
//
// This only changes behavior when the node isn't where the caller thinks (an
// already-error state), so it can't break normal DOM operations.
export function installDomGuard(): void {
  if (typeof Node === "undefined" || !Node.prototype) return;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) return newNode;
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
