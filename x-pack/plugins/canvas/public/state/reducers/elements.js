/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { handleActions } from 'redux-actions';
import { assign, push, del, set } from 'object-path-immutable';
import { get } from 'lodash';
import * as actions from '../actions/elements';

const getLocation = type => (type === 'group' ? 'groups' : 'elements');

const getLocationFromIds = (workpadState, pageId, nodeId) =>
  workpadState.pages.find(p => p.id === pageId).groups.find(e => e.id === nodeId)
    ? 'groups'
    : 'elements';

function getPageIndexById(workpadState, pageId) {
  return get(workpadState, 'pages', []).findIndex(page => page.id === pageId);
}

function getNodeIndexById(page, nodeId, location) {
  return page[location].findIndex(node => node.id === nodeId);
}

function assignNodeProperties(workpadState, pageId, nodeId, props) {
  const pageIndex = getPageIndexById(workpadState, pageId);
  const location = getLocationFromIds(workpadState, pageId, nodeId);
  const nodesPath = ['pages', pageIndex, location];
  const nodeIndex = get(workpadState, nodesPath, []).findIndex(node => node.id === nodeId);

  if (pageIndex === -1 || nodeIndex === -1) return workpadState;

  // remove any AST value from the element caused by https://github.com/elastic/kibana-canvas/issues/260
  // TODO: remove this after a bit of time
  const cleanWorkpadState = del(workpadState, nodesPath.concat([nodeIndex, 'ast']));

  return assign(cleanWorkpadState, nodesPath.concat(nodeIndex), props);
}

function moveNodeLayer(workpadState, pageId, nodeId, movement, location) {
  const pageIndex = getPageIndexById(workpadState, pageId);
  const nodeIndex = getNodeIndexById(workpadState.pages[pageIndex], nodeId, location);
  const nodes = get(workpadState, ['pages', pageIndex, location]);
  const from = nodeIndex;

  const to = (function() {
    if (movement < Infinity && movement > -Infinity) return nodeIndex + movement;
    if (movement === Infinity) return nodes.length - 1;
    if (movement === -Infinity) return 0;
    throw new Error('Invalid element layer movement');
  })();

  if (to > nodes.length - 1 || to < 0) return workpadState;

  // Common
  const newNodes = nodes.slice(0);
  newNodes.splice(to, 0, newNodes.splice(from, 1)[0]);

  return set(workpadState, ['pages', pageIndex, location], newNodes);
}

export const elementsReducer = handleActions(
  {
    // TODO: This takes the entire element, which is not necessary, it could just take the id.
    [actions.setExpression]: (workpadState, { payload }) => {
      const { expression, pageId, elementId } = payload;
      return assignNodeProperties(workpadState, pageId, elementId, { expression });
    },
    [actions.setFilter]: (workpadState, { payload }) => {
      const { filter, pageId, elementId } = payload;
      return assignNodeProperties(workpadState, pageId, elementId, { filter });
    },
    [actions.setMultiplePositions]: (workpadState, { payload }) =>
      payload.repositionedElements.reduce(
        (previousWorkpadState, { position, pageId, elementId }) =>
          assignNodeProperties(previousWorkpadState, pageId, elementId, { position }),
        workpadState
      ),
    [actions.elementLayer]: (workpadState, { payload: { pageId, elementId, movement } }) => {
      const location = getLocationFromIds(workpadState, pageId, elementId);
      return moveNodeLayer(workpadState, pageId, elementId, movement, location);
    },
    [actions.addElement]: (workpadState, { payload: { pageId, element } }) => {
      const pageIndex = getPageIndexById(workpadState, pageId);
      if (pageIndex < 0) return workpadState;
      return push(workpadState, ['pages', pageIndex, getLocation(element.position.type)], element);
    },
    [actions.duplicateElement]: (workpadState, { payload: { pageId, element } }) => {
      const pageIndex = getPageIndexById(workpadState, pageId);
      if (pageIndex < 0) return workpadState;
      return push(workpadState, ['pages', pageIndex, getLocation(element.position.type)], element);
    },
    [actions.removeElements]: (workpadState, { payload: { pageId, elementIds } }) => {
      const pageIndex = getPageIndexById(workpadState, pageId);
      if (pageIndex < 0) return workpadState;

      const nodeIndices = elementIds
        .map(nodeId => {
          const location = getLocationFromIds(workpadState, pageId, nodeId);
          return {
            location,
            index: getNodeIndexById(workpadState.pages[pageIndex], nodeId, location),
          };
        })
        .sort((a, b) => b.index - a.index); // deleting from end toward beginning, otherwise indices will become off - todo fuse loops!

      return nodeIndices.reduce((state, { location, index }) => {
        return del(state, ['pages', pageIndex, location, index]);
      }, workpadState);
    },
  },
  {}
);
