import { useOpenContextMenuDispatch } from "../Modals/ContextMenu";
import React from "react";

export const ConflictShell = ({
    conflict, // conflict has "lastChangesUserName" (optional), "ignoreChanges", "acceptChanges", and "externalChangeDisplay"
    children
}) => {
    if (!conflict) { return children; }
    const openMenuDispatcher = useOpenContextMenuDispatch();
    const handleRightClickConflict = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const content = (
            <div className="conflict-context-menu">
                {conflict.lastChangesUsername && <div>
                    Last changes made by {conflict.lastChangesUsername}
                </div>}
                <div className="conflict-selection" onClick={conflict.ignoreChanges}>
                    <div className="conflict-selection-header">Keep My Changes</div>
                </div>
                <div className="conflict-selection" onClick={conflict.acceptChanges}>
                    <div className="conflict-selection-header">Accept Other User&apos;s Changes:</div>
                    <div>{(conflict.externalChangeDisplay == null || conflict.externalChangeDisplay == '') ? 'Item was cleared' : conflict.externalChangeDisplay}</div>
                </div>
            </div>
        );
        openMenuDispatcher({
            type: 'setMenuContent',
            content,
            position: { x: e.pageX, y: e.pageY }
        });
    };
    return (
        <div title="Right-click to resolve conflict" className="conflict-shell" onContextMenu={handleRightClickConflict}>
            {children}
        </div>
    );
};
