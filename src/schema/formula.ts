/**
 * Matomo - free/libre analytics platform
 *
 * @link https://matomo.org
 * @license http://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

import {
  create,
  MathNode,
  AccessorNode,
  ConditionalNode,
  OperatorNode,
  ParenthesisNode,
  RelationalNode,
  SymbolNode,
  ConstantNode,
  equalScalarDependencies,
  numberDependencies,
  stringDependencies,
  booleanDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
  absDependencies,
  addScalarDependencies,
  multiplyScalarDependencies,
  multiplyDependencies,
  subtractDependencies,
  bitAndDependencies,
  bitNotDependencies,
  bitOrDependencies,
  bitXorDependencies,
  notDependencies,
  orDependencies,
  xorDependencies,
  numericDependencies,
  divideScalarDependencies,
  andDependencies,
  compareDependencies,
  compareNaturalDependencies,
  compareTextDependencies,
  equalDependencies,
  equalTextDependencies,
  smallerDependencies,
  smallerEqDependencies,
  largerDependencies,
  largerEqDependencies,
  unequalDependencies,
  maxDependencies,
  minDependencies,
  addDependencies,
  indexDependencies,
  ConditionalNodeDependencies,
  IndexNodeDependencies,
  OperatorNodeDependencies,
  ParenthesisNodeDependencies,
  RangeNodeDependencies,
  RelationalNodeDependencies,
  SymbolNodeDependencies,
  FunctionNodeDependencies,
  parseDependencies,
  compileDependencies,
  divideDependencies,
  nullDependencies,
} from 'mathjs/lib/esm/number';

const math = create([
  equalScalarDependencies,
  numberDependencies,
  stringDependencies,
  booleanDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
  absDependencies,
  addScalarDependencies,
  multiplyScalarDependencies,
  multiplyDependencies,
  subtractDependencies,
  bitAndDependencies,
  bitNotDependencies,
  bitOrDependencies,
  bitXorDependencies,
  notDependencies,
  orDependencies,
  xorDependencies,
  numericDependencies,
  divideScalarDependencies,
  andDependencies,
  compareDependencies,
  compareNaturalDependencies,
  compareTextDependencies,
  equalDependencies,
  equalTextDependencies,
  smallerDependencies,
  smallerEqDependencies,
  largerDependencies,
  largerEqDependencies,
  unequalDependencies,
  maxDependencies,
  minDependencies,
  addDependencies,
  indexDependencies,
  ConditionalNodeDependencies,
  IndexNodeDependencies,
  OperatorNodeDependencies,
  ParenthesisNodeDependencies,
  RangeNodeDependencies,
  RelationalNodeDependencies,
  SymbolNodeDependencies,
  FunctionNodeDependencies,
  parseDependencies,
  compileDependencies,
  divideDependencies,
  nullDependencies,
]);

const SUPPORTED_FUNCTIONS = {
  min: 'NARY_MIN',
  max: 'NARY_MAX',
  abs: 'ABS',
};

// required for RelationalNodeMap
const OperatorNodeMap = {
  xor: 'xor',
  and: 'and',
  or: 'or',
  bitOr: '|',
  bitXor: '^|',
  bitAnd: '&',
  equal: '==',
  unequal: '!=',
  smaller: '<',
  larger: '>',
  smallerEq: '<=',
  largerEq: '>=',
  leftShift: '<<',
  rightArithShift: '>>',
  rightLogShift: '>>>',
  to: 'to',
  add: '+',
  subtract: '-',
  multiply: '*',
  divide: '/',
  dotMultiply: '.*',
  dotDivide: './',
  mod: 'mod',
  unaryPlus: '+',
  unaryMinus: '-',
  bitNot: '~',
  not: 'not',
  pow: '^',
  dotPow: '.^',
  factorial: '!',
};

function toLookerString(ast: MathNode): string {
  if (!ast) {
    return '';
  }

  switch (ast.type) {
    case 'AccessorNode':
      const accessor = ast as AccessorNode;
      if (accessor.object.type !== 'SymbolNode'
        || (accessor.object.type as SymbolNode).name !== '$goals'
        || accessor.index.dimensions.length > 1
      ) {
        throw new Error(`Invalid accessor '${accessor}' found in formula. Currently only the $goals column can`
          + ' be used this way, and with only one dimension.');
      }

      const idgoalIndex = accessor.index.dimensions[0];
      if (idgoalIndex.type !== 'ConstantNode') {
        throw new Error(`Invalid goal index in '${accessor}', expected something like '$goals["idgoal=1"]'.`);
      }

      const idgoal = ((idgoalIndex as ConstantNode).value as string).match(/^idgoal=(\d+)$/)[1];
      if (typeof idgoal !== 'string') {
        throw new Error(`Could not extract goal ID from '${accessor}'.`);
      }

      return `$goals_${idgoal}_${accessor.index.dimensions[1]}`;
    case 'ConditionalNode':
      const conditional = ast as ConditionalNode;
      return `IF(${toLookerString(conditional.condition)}, ${toLookerString(conditional.trueExpr)}, ${toLookerString(conditional.falseExpr)})`;
    case 'OperatorNode':
      const operator = ast as OperatorNode;
      return operator.args.map(toLookerString).join(` ${operator.op} `);
    case 'ParenthesisNode':
      const parenthesis = ast as ParenthesisNode;
      return `(${toLookerString(parenthesis.content)})`;
    case 'RelationalNode':
      const relational = ast as RelationalNode;
      let relationalStr = toLookerString(ast.params[0]);
      relational.conditionals.forEach((op, i) => {
        relationalStr += ` ${OperatorNodeMap[op]} ${toLookerString(ast.params[i + 1])}`;
      });
      return relationalStr;
    case 'ConstantNode':
    case 'SymbolNode':
      return ast.toString();
    case 'FunctionNode':
      if (!SUPPORTED_FUNCTIONS[ast.fn.name]) {
        throw new Error(`Unknown function used in Matomo formula: ${ast.fn.name}.`);
      }
      ast.fn.name = SUPPORTED_FUNCTIONS[ast.fn.name];
      return ast.toString();
    case 'ArrayNode':
    case 'AssignmentNode':
    case 'BlockNode':
    case 'RangeNode':
    case 'ObjectNode':
    case 'FunctionAssignmentNode':
      throw new Error(`unsupported formula: found disallowed node ${ast.type} in '${ast}'`); // TODO: handle this
    case 'IndexNode':
      throw new Error(`Unexpected node found in formula: ${ast}`); // TODO: handle this
    default:
      throw new Error(`unknown node ${ast.type} in formula: ${ast}`); // TODO: handle this
  }
}

export function mapMatomoFormulaToLooker(formula?: string): {
  lookerFormula?: string,
  temporaryMetrics: string[],
} {
  if (!formula) {
    return {
      temporaryMetrics: [],
    };
  }

  let ast;
  try {
    ast = math.parse(formula);
  } catch (e) {
    throw new Error(`Failed to parse formula '${formula}': ${e.stack || e.message || e}`);
  }

  const temporaryMetrics = [];
  ast.traverse((node) => {
    if (node.type === 'SymbolNode' && (node as SymbolNode).name.startsWith('$')) {
      temporaryMetrics.push((node as SymbolNode).name.substring(1));
    }
  });

  const lookerFormula = toLookerString(ast);

  return {
    lookerFormula,
    temporaryMetrics,
  };
}
