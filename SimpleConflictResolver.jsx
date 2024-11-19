import React, { useEffect, useState } from "react";
import Modal from "../Modals/Modal";
import '@/components/ConflictResolver/ConflictResolver.css';
import { FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import { format, parseISO } from "date-fns";

// CURRENTLY ONLY WORKS WITH FLAT ENTITIES

export const ConflictResolverModal = ({ conflicts: originalConflicts, lastUserName, closeModal, onSubmit }) => {
    const [conflicts, setConflicts] = useState(originalConflicts);
    const handleSubmit = () => {
        onSubmit(conflicts);
        closeModal();
    };
    const handleOverrideAll = () => { Object.keys(conflicts).forEach(x => handleUserSelection(x, true)); };
    const handleUserSelection = (propName, uiValueIsSelected) => {
        setConflicts(prevVals => {
            const selectedConflict = prevVals[propName];
            return {
                ...prevVals,
                [propName]: {
                    ...selectedConflict,
                    uiValueIsSelected
                }
            };
        });
    };
    return (
        <Modal closeModal={closeModal} isDraggable={true}>
            <h5>This item has been updated by another user {lastUserName ? `(${lastUserName})` : ''} while you have been viewing it.  Please resolve conflicts to continue.</h5>
            <table className="conflict-resolver-table">
                <thead>
                    <tr>
                        <th>Field</th>
                        <th>Current Value</th>
                        <th>Your Value</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.values(conflicts).map((c, i) => {
                        const handleExternalValueSelected = () => { handleUserSelection(c.propName, false); };
                        const handleUiValueSelected = () => { handleUserSelection(c.propName, true); };
                        return (
                            <ConflictResolverRow
                                key={'conflict' + i}
                                uiValue={c.uiValue}
                                uiDisplayValue={c.uiDisplayValue}
                                externalValue={c.externalValue}
                                externalDisplayValue={c.externalDisplayValue}
                                uiValueIsSelected={c.uiValueIsSelected}
                                currentUserChangedValue={c.currentUserChangedValue}
                                propDisplayName={c.propDisplayName}
                                onUiValueSelected={handleUiValueSelected}
                                onExternalValueSelected={handleExternalValueSelected}
                                dateFormat={c.dateFormat}
                            />
                        );
                    })}
                </tbody>
            </table>
            <div className="conflict-resolver-buttons">
                <button onClick={handleSubmit}>Submit</button>
                <button onClick={handleOverrideAll}>Override All</button>
                <button onClick={closeModal}>Cancel</button>
            </div>
        </Modal>
    );
};

export const ConflictResolverRow = ({
    uiValue,
    uiDisplayValue,
    externalValue,
    externalDisplayValue,
    uiValueIsSelected,
    currentUserChangedValue,
    onUiValueSelected,
    onExternalValueSelected,
    propDisplayName,
    dateFormat = null
}) => {
    const resolverClass = (currentUserChangedValue ? 'user-vs-user ' : '') + (uiValueIsSelected ? 'ui-value-selected' : 'external-value-selected');
    const getValueDisplay = (val) => {
        if (typeof val === 'boolean') {
            return val ? <FaCheckCircle/> : <FaTimesCircle/>;
        } else if (val.constructor.name === 'Date') {
            return format(val, dateFormat ?? 'yyyy-MM-dd');
        } else { return val; }
    };
    return (
        <tr className={resolverClass}>
            <td>{propDisplayName}</td>
            <td className="conflict-resolver-external-value" onClick={onExternalValueSelected}>
                {externalDisplayValue ?? getValueDisplay(externalValue)}
            </td>
            <td className="conflict-resolver-ui-value" onClick={onUiValueSelected}>
                {uiDisplayValue ?? getValueDisplay(uiValue)}
            </td>
        </tr>
    );
};

class ConflictManager {
    constructor (
        propName,
        propDisplayName,
        uiValue,
        externalValue,
        currentUserChangedValue,
        uiDisplayValue = null,
        externalDisplayValue = null
    ) {
        this.propName = propName;
        this.propDisplayName = propDisplayName;
        this.uiValue = uiValue;
        this.uiDisplayValue = uiDisplayValue;
        this.externalValue = externalValue;
        this.externalDisplayValue = externalDisplayValue;
        this.uiValueIsSelected = currentUserChangedValue;
        this.currentUserChangedValue = currentUserChangedValue;
    }
}

export const CONFLICT_RESULTS = { NONE: 'NONE', RESOLUTION_REQUIRED: 'RESOLUTION REQUIRED', CONFLICTS_AUTOMATICALLY_RESOLVED: 'CONFLICTS AUTO-RESOLVED' };

/**
 * A hook to manage simple, single-entity user conflict resolution
 * @param {*} initialValues The values of the entity before user makes changes.
 * @param {*} supportedConflicts An array of properties to support.  Each item must have a "propName" (name of property) and a "displayName" (label text for property).
 * If the conflict has a matching display property, item must have "displayPropName" (name of display property).  Finally, if item is an ISO date, you must specify the
 * format to use in a "dateFormat" property.  i.e.: 'yyyy-MM-dd'
 * @param {*} handleChangeByPropertyPathAndValue Function to allow hook to update form values after user has made their selections.
 * @returns activeConflicts, checkForConflicts, resolveConflicts, lastChangesUsername, and resolveSingleConflict.
 */
export const useSimpleConflictResolver = (initialValues, supportedConflicts, handleChangeByPropertyPathAndValue) => {
    const [activeConflicts, setActiveConflicts] = useState({});
    const [resolvedConflicts, setResolvedConflicts] = useState({});
    const [lastChangesUsername, setLastChangesUsername] = useState(null);
    // we need to track the values after each submission, in order to recognize if the DB values change multiple times
    const [valuesBeforeSubmit, setValuesBeforeSubmit] = useState(initialValues);
    // if initialValues change, conflict data is cleared.  It is assumed that the user has selected a different entity
    useEffect(() => {
        setActiveConflicts({});
        setResolvedConflicts({});
        setLastChangesUsername(null);
        setValuesBeforeSubmit(() => {
            const result = {};
            supportedConflicts.forEach(c => {
                result[c.propName] = initialValues[c.propName];
            });
            return result;
        });
    }, [initialValues]);

    /** Updates activeConflicts and returns true if any conflicts remain
     * @param {*} submittedValues The current values being submitted by the user
     * @param {*} dbValues Values pulled directly from DB
     * @returns true if there are active conflicts.
     */
    const checkForConflicts = (submittedValues, dbValues) => {
        setLastChangesUsername(dbValues.lastUserName);
        const result = {
            formValues: { ...submittedValues },
            conflictResult: CONFLICT_RESULTS.NONE
        };
        const conflicts = {};
        let autoResolvedConflicts = 0;
        supportedConflicts.forEach(c => {
            const property = c.propName;
            const currentUserChangedValue = valuesBeforeSubmit[property] != submittedValues[property];
            let valueBeingSumbitted = submittedValues[property];
            let valueInDb = dbValues[property];
            let valueAtFormLoad = valuesBeforeSubmit[property];
            if (c.dateFormat != null) {
                // dates need formatted to correctly compare with DB ISO value
                valueBeingSumbitted = valueBeingSumbitted ? format(parseISO(valueBeingSumbitted), c.dateFormat) : null;
                valueInDb = valueInDb ? format(parseISO(valueInDb), c.dateFormat) : null;
                valueAtFormLoad = valueAtFormLoad ? format(parseISO(valueAtFormLoad), c.dateFormat) : null;
            }
            if (Object.prototype.hasOwnProperty.call(resolvedConflicts, property) &&
                resolvedConflicts[property] == valueInDb) { // already resolved
                console.log(`Prop ${property} with value ${valueInDb} was resolved previously`);
                return;
            }

            // update externally changed values that user did not change
            if (valueInDb != valueAtFormLoad && !currentUserChangedValue) {
                handleChangeByPropertyPathAndValue(property, valueInDb);
                setValuesBeforeSubmit(prevVals => ({
                    ...prevVals,
                    [property]: valueInDb
                }));
                result.formValues[property] = valueInDb;
                autoResolvedConflicts++;
            }
            if (
                valueInDb != valueAtFormLoad && currentUserChangedValue && valueBeingSumbitted != valueInDb
            ) {
            // require user input for all externally changed values
            // if (
            //     valueInDb != valueAtFormLoad && // value was changed by other user
            //         (!currentUserChangedValue || // user did not change value
            //         (currentUserChangedValue && valueBeingSumbitted != valueInDb)) // current user and other user selected conflicting values
            // ) {
                const uiDisplayValue = c.displayPropName ? submittedValues[c.displayPropName] : null;
                const externalDisplayValue = c.displayPropName ? dbValues[c.displayPropName] : null;
                conflicts[property] = new ConflictManager(
                    c.propName,
                    c.displayName,
                    valueBeingSumbitted,
                    valueInDb,
                    currentUserChangedValue,
                    uiDisplayValue,
                    externalDisplayValue
                );
            }
        });
        const activeAndNewConflicts = {
            ...activeConflicts,
            ...conflicts
        };
        setActiveConflicts(activeAndNewConflicts);
        const activeConflictsExist = Object.keys(activeAndNewConflicts).length > 0;
        if (activeConflictsExist) {
            result.conflictResult = CONFLICT_RESULTS.RESOLUTION_REQUIRED;
        } else if (autoResolvedConflicts) {
            result.conflictResult = CONFLICT_RESULTS.CONFLICTS_AUTOMATICALLY_RESOLVED;
        }
        return result;
    };
    /**
     * Updates activeConflicts and tracks resolved conflicts for a single property
     * @param {String} propName The name of the property being resolved
     * @param {boolean} uiValueIsSelected Submit "true" to set the value to what the user is submitting or false to accept the external user's change
     */
    const resolveSingleConflict = (propName, uiValueIsSelected) => {
        const conflict = activeConflicts[propName];
        const selectedValue = uiValueIsSelected ? conflict.uiValue : conflict.externalValue;
        const unselectedValue = uiValueIsSelected ? conflict.externalValue : conflict.uiValue;
        handleChangeByPropertyPathAndValue(propName, selectedValue);
        setResolvedConflicts(prevVals => ({
            ...prevVals,
            [propName]: unselectedValue
        }));
        setActiveConflicts(prevVals => {
            const clone = { ...prevVals };
            delete clone[propName];
            return clone;
        });
    };
    /**
     * Updates activeConflicts and tracks resolved conflicts for this entity
     * @param {*} conflictSelections Conflicts resolved by user selection
     */
    const resolveConflicts = (conflictSelections) => {
        Object.keys(conflictSelections).forEach(propName => {
            const conflict = conflictSelections[propName];
            const selectedValue = conflict.uiValueIsSelected ? conflict.uiValue : conflict.externalValue;
            const unselectedValue = conflict.uiValueIsSelected ? conflict.externalValue : conflict.uiValue;
            handleChangeByPropertyPathAndValue(propName, selectedValue);
            setResolvedConflicts(prevVals => ({
                ...prevVals,
                [propName]: unselectedValue
            }));
        });
        setActiveConflicts({});
        console.log(resolvedConflicts);
    };

    return {
        activeConflicts, checkForConflicts, resolveConflicts, lastChangesUsername, resolveSingleConflict
    };
};
