import babelTraverse from '@babel/traverse'
import t from '@babel/types'
/**
 * Styled组件转换的共享函数
 */
import { analyzeTypeParameter } from './ast-traverser'
import { ErrorType, handleError, logDebug } from './error-handler'
import { useContext } from './type-context'

import { handleMultilineObject, parseInlineProps, stringifyProps } from './type-processors'
import { extractObjectContent, isObjectType, parseComplexType, splitTypeByOperator, typeScriptToVueProp } from './type-utils'

const traverse = ((babelTraverse as any).default as typeof babelTraverse) || babelTraverse

/**
 * 处理联合类型
 */
export function handleUnionType(unionText: string): string | undefined {
  return handleComplexType(unionText, 'union')
}

/**
 * 处理交叉类型 (A & B)
 */
export function handleIntersectionType(intersectionText: string): string | undefined {
  return handleComplexType(intersectionText, 'intersection')
}

/**
 * 合并属性集合，处理required属性冲突
 * 这个函数将源属性集合合并到目标属性集合中，如果属性重复，
 * 保留required=true的版本，这样可以确保合并后的结果保持最严格的属性要求。
 *
 * 该函数用于：
 * 1. 处理联合类型(handleUnionType)中的属性合并
 * 2. 处理交叉类型(handleIntersectionType)中的属性合并
 * 3. 处理对象交叉类型(handleObjectIntersectionType)中的属性合并
 *
 * @param target 目标属性集合
 * @param source 源属性集合
 */
function mergeProps(
  target: Record<string, { type: string, required: boolean }>,
  source: Record<string, { type: string, required: boolean }>,
): void {
  Object.entries(source).forEach(([key, value]) => {
    // 如果属性已存在，保留required=true的版本
    if (target[key]) {
      if (value.required) {
        target[key] = value
      }
    }
    else {
      target[key] = value
    }
  })
}

/**
 * 处理类型内容并提取属性
 *
 * @param typeContent 类型内容字符串
 * @param genericParams 可选的泛型参数
 * @returns 解析到的属性映射，如果处理失败则返回undefined
 */
function processTypeContent(typeContent: string, genericParams?: string): Record<string, { type: string, required: boolean }> | undefined {
  try {
    // 确保类型内容是对象类型
    if (!isObjectType(typeContent)) {
      return undefined
    }

    // 解析类型内容中的属性
    const content = extractObjectContent(typeContent)
    const propMap = parsePropsFromTypeStr(content)

    // 如果提供了泛型参数，可以进一步处理
    if (genericParams) {
      const params = genericParams.split(',').map(p => p.trim())
      if (params.length > 0 && params[0] !== '') {
        // 这里可以添加针对泛型参数的处理逻辑
        // 例如处理 Map<string, number> 中的 string 和 number
      }
    }

    return propMap
  }
  catch (e) {
    handleError(
      ErrorType.TYPE_PARSE_ERROR,
      `Failed to process type content: ${typeContent.substring(0, 50)}${typeContent.length > 50 ? '...' : ''}`,
      e,
    )
    return undefined
  }
}

/**
 * 处理复杂类型（联合或交叉类型）的通用函数
 * @param typeText 类型文本
 * @param typeKind 类型种类：'union'或'intersection'
 * @returns 处理后的属性字符串
 */
function handleComplexType(typeText: string, typeKind: 'union' | 'intersection'): string | undefined {
  try {
    const { typeMap, typeAliasMap } = useContext()

    // 使用类型工具解析复杂类型
    const { parts, isUnion, isIntersection } = parseComplexType(typeText)

    // 根据类型种类验证解析结果
    if ((typeKind === 'union' && !isUnion) || (typeKind === 'intersection' && !isIntersection) || parts.length === 0) {
      throw new Error(`Cannot handle ${typeKind === 'union' ? 'union' : 'intersection'} type: ${typeText}`)
    }

    // 合并的属性集合
    const mergedProps: Record<string, { type: string, required: boolean }> = {}
    let hasObjectType = false

    // 处理每个部分
    for (const part of parts) {
      // 处理对象字面量
      if (isObjectType(part)) {
        hasObjectType = true
        try {
          const objContent = extractObjectContent(part)
          const objProps = parseInlineProps(typeAliasMap, objContent)

          // 合并属性
          mergeProps(mergedProps, objProps)
        }
        catch (e) {
          handleError(
            ErrorType.TYPE_PARSE_ERROR,
            `解析${typeKind === 'union' ? '联合' : '交叉'}类型的对象部分失败: ${part}`,
            e,
          )
        }
      }
      // 处理泛型引用类型，如 Array<T> & { extra: string }
      else if (part.match(/[A-Z]\w*<.+>/i)) {
        const genericMatch = part.match(/([A-Z]\w*)<(.+)>/i)
        if (genericMatch) {
          const [, baseTypeName, genericParams] = genericMatch

          // 检查是否是容器类型
          if (['Array', 'Set', 'List'].includes(baseTypeName)) {
            // 不合并属性，因为数组类型通常没有可合并的属性
            continue
          }

          // 处理自定义泛型类型
          if (typeMap.has(baseTypeName)) {
            const typeContent = typeMap.get(baseTypeName) || ''

            // 检查类型内容是否是对象类型
            if (isObjectType(typeContent)) {
              const result = processTypeContent(typeContent, genericParams)
              if (result) {
                hasObjectType = true
                mergeProps(mergedProps, result)
              }
            }
          }
        }
      }
      // 处理普通引用类型
      else if (/^[A-Z_]\w*$/i.test(part)) {
        if (typeMap.has(part)) {
          const typeStr = typeMap.get(part) || ''
          if (isObjectType(typeStr)) {
            hasObjectType = true
            try {
              const result = processTypeContent(typeStr)
              if (result) {
                mergeProps(mergedProps, result)
              }
            }
            catch (e) {
              handleError(
                ErrorType.TYPE_PARSE_ERROR,
                `解析引用类型失败: ${part}`,
                e,
              )
            }
          }
        }
      }
    }

    // 如果有对象类型，返回合并后的属性对象
    if (hasObjectType && Object.keys(mergedProps).length > 0) {
      return stringifyProps(mergedProps)
    }

    throw new Error(`Cannot handle ${typeKind === 'union' ? 'union' : 'intersection'} type: ${typeText}`)
  }
  catch (err) {
    handleError(
      ErrorType.TYPE_PARSE_ERROR,
      `处理${typeKind === 'union' ? '联合' : '交叉'}类型失败: ${typeText}`,
      err,
    )
  }
}

/**
 * 从类型字符串中解析属性定义
 *
 * @param content 类型定义字符串内容，通常是对象类型的内部内容
 * @returns 属性名到属性类型和必要性的映射
 */
function parsePropsFromTypeStr(content: string): Record<string, { type: string, required: boolean }> {
  const props: Record<string, { type: string, required: boolean }> = {}

  try {
    // 更健壮的属性匹配正则，支持更多格式
    // 匹配形如 propName: { type: X, required: Y } 的模式
    const propRegex = /(\w+)\s*:\s*(\{[^{}]*\})/g
    let match

    while ((match = propRegex.exec(content)) !== null) {
      const [, propName, propValue] = match
      if (!propName || !propValue)
        continue

      try {
        // 尝试解析属性值对象，处理常见的构造函数名称和属性引用
        const cleanValue = propValue
          .replace(/\b(String|Number|Boolean|Array|Object|Function|Symbol|BigInt)\b/g, '"$1"')
          .replace(/(\w+):/g, '"$1":')
          .replace(/'/g, '"')

        try {
          // 尝试使用JSON解析
          const propValueObj = JSON.parse(cleanValue)
          props[propName] = {
            type: propValueObj.type || 'String', // 默认为String类型
            required: propValueObj.required !== false, // 默认为必需
          }
        }
        catch (parseError) {
          // JSON解析失败时使用正则提取
          const typeMatch = propValue.match(/type\s*:\s*([^,}]+)/)
          const requiredMatch = propValue.match(/required\s*:\s*(true|false)/)

          if (typeMatch && typeMatch[1]) {
            props[propName] = {
              type: typeMatch[1].trim(),
              required: !(requiredMatch && requiredMatch[1] === 'false'),
            }
          }
          else {
            // If type information cannot be extracted correctly, use default value
            logDebug(`Unable to parse property type, using default value: ${propName}`)
            props[propName] = {
              type: 'String',
              required: true,
            }
          }
        }
      }
      catch (e) {
        handleError(
          ErrorType.TYPE_PARSE_ERROR,
          `解析属性失败: ${propName}`,
          e,
        )
      }
    }
  }
  catch (e) {
    handleError(
      ErrorType.TYPE_PARSE_ERROR,
      `解析属性字符串失败: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
      e,
    )
  }

  return props
}

/**
 * 处理对象与其他类型的交叉类型，如 {prop: string} & OtherType
 *
 * @param typeMap 类型映射
 * @param intersectionText 交叉类型文本
 * @param inlineProps 内联对象属性
 * @returns 处理后的属性字符串
 */
export function handleObjectIntersectionType(
  typeMap: Map<string, string>,
  intersectionText: string,
  inlineProps: Record<string, { type: string, required: boolean }>,
): string {
  try {
    // 使用类型工具解析交叉类型
    const { parts } = parseComplexType(intersectionText)

    // 合并属性的结果对象
    const mergedProps = { ...inlineProps }

    // 处理除内联对象外的其他类型
    for (const part of parts) {
      // 跳过内联对象部分，因为已经通过inlineProps参数传入
      if (isObjectType(part)) {
        continue
      }

      // 处理引用类型
      const typeName = part.trim()
      if (/^[A-Z_]\w*$/i.test(typeName) && typeMap.has(typeName)) {
        const typeStr = typeMap.get(typeName) || ''

        if (isObjectType(typeStr)) {
          try {
            // 处理引用类型
            const result = processTypeContent(typeStr)
            if (result) {
              mergeProps(mergedProps, result)
            }
          }
          catch (e) {
            handleError(
              ErrorType.TYPE_PARSE_ERROR,
              `解析交叉类型的引用部分失败: ${typeName}`,
              e,
            )
          }
        }
      }
    }

    // 将合并后的属性转换为字符串
    return stringifyProps(mergedProps)
  }
  catch (err) {
    handleError(
      ErrorType.TYPE_PARSE_ERROR,
      `处理对象交叉类型失败: ${intersectionText}`,
      err,
    )
    // 回退到只使用内联属性
    return stringifyProps(inlineProps)
  }
}

/**
 * 处理类型参数中的复杂类型
 */
export function processTypeParameters(tag: any, typeText: string): string | undefined {
  try {
    logDebug(`处理类型参数: ${typeText}`)

    // 获取类型上下文
    const { typeMap, typeAliasMap } = useContext()

    // 提取类型文本，提取实际参数
    let params = typeText
    let typeName = ''

    // 如果是形如 <Props> 的泛型参数
    if (typeText.startsWith('<') && typeText.endsWith('>')) {
      params = typeText.slice(1, -1).trim()

      // 分析类型参数
      const typeInfo = analyzeTypeParameter(params)
      if (typeInfo.isReference) {
        typeName = typeInfo.name
        // 处理引用类型
        if (typeMap.has(typeName)) {
          return typeMap.get(typeName)!
        }
        else if (typeInfo.typeParameters && typeInfo.typeParameters.length > 0) {
          // 处理带泛型参数的类型引用或类型组合
          if (typeInfo.typeParameters[0].composition) {
            return typeInfo.typeParameters[0].text
          }
          else if (typeInfo.typeParameters[0].text) {
            // 递归处理泛型参数中的类型
            const processedInnerParams = processInnerGenericParams(typeInfo.typeParameters[0].text)
            return `${typeName}<${processedInnerParams}>`
          }
        }
      }
      else if (typeInfo.name === 'object') {
        // 处理对象类型，使用新的类型工具
        return typeScriptToVueProp(params)
      }
      else if (params.includes('{') && params.includes('}')) {
        // 处理包含内联对象的复杂表达式
        if (params.startsWith('{') && params.endsWith('}')) {
          // 处理完整的内联对象
          return handleMultilineObject(typeAliasMap, params)
        }
        else {
          // 处理包含内联对象但有其他内容的复杂表达式
          // 先检查是否有泛型结构
          const typeWithGeneric = /([A-Z][a-zA-Z0-9]*)<(.+)>/.exec(params)
          if (typeWithGeneric && typeWithGeneric[2].includes('{')) {
            // 处理泛型中包含内联对象的情况，如 Container<{ prop: string }>
            const [, typeName, genericContent] = typeWithGeneric

            // 处理内联对象
            if (genericContent.startsWith('{') && genericContent.endsWith('}')) {
              const processedGenericContent = handleMultilineObject(typeAliasMap, genericContent)
              // 重新组合类型
              return processNestedGeneric(`${typeName}<${processedGenericContent}>`, typeMap, typeAliasMap)
            }
          }
          // 处理标准的内联对象
          const objMatch = params.match(/\{([^{}]*)\}/)
          if (objMatch && objMatch[1]) {
            const objContent = objMatch[1].trim()
            if (objContent) {
              try {
                const objProps = parseInlineProps(typeAliasMap, objContent)

                // 判断类型表达式的性质
                if (params.includes('&')) {
                  // 交叉类型
                  return handleObjectIntersectionType(typeMap, params, objProps)
                }
                else if (params.includes('|')) {
                  // 联合类型
                  return handleUnionType(params)
                }
                else {
                  return stringifyProps(objProps)
                }
              }
              catch (e) {
                handleError(
                  ErrorType.TYPE_PARSE_ERROR,
                  `解析内联对象失败: ${params}`,
                  e,
                )
              }
            }
          }
          else if (params.includes('&')) {
            // 处理不包含内联对象的交叉类型
            return handleIntersectionType(params)
          }
          else if (params.includes('|')) {
            // 处理联合类型
            return handleUnionType(params)
          }
        }
      }
      // 处理可能包含别名类型的泛型参数
      else if (/[A-Z][a-zA-Z0-9]*<.+>/.test(params)) {
        // 解析嵌套泛型结构
        return processNestedGeneric(params, typeMap, typeAliasMap)
      }
      // 联合或交叉类型：Theme & WithLoading 或 Theme | WithLoading
      else if (params.includes('|')) {
        // 处理联合或交叉类型
        const prop = handleUnionType(params)
        // console.log('prop', prop)
        return prop
      }
      else if (params.includes('&')) {
        // 处理交叉类型
        return handleIntersectionType(params)
      }
    }
    throw new Error(`Cannot handle type parameter: ${params}`)
  }
  catch (err) {
    handleError(
      ErrorType.TYPE_PARSE_ERROR,
      `处理类型参数失败: ${typeText}`,
      err,
    )
    return '{ type: Object, required: true }'
  }
}

/**
 * 处理内联泛型参数中的类型，包括别名类型
 *
 * @param paramText 泛型参数文本
 * @param typeMap 类型映射
 * @param typeAliasMap 类型别名映射
 * @returns 处理后的泛型参数文本
 */
export function processInnerGenericParams(
  paramText: string,
): string {
  const { typeMap, typeAliasMap } = useContext()
  // 首先尝试分割可能存在的多个参数
  const params = splitTypeByOperator(paramText, ',')

  // 处理每个参数
  return params.map((param) => {
    param = param.trim()

    // 检查是否是引用类型
    if (/^[A-Z_]\w*$/.test(param)) {
      // 如果是引用类型，查找类型映射
      if (typeMap.has(param)) {
        return typeMap.get(param) || param
      }
      // 查找类型别名映射
      else if (typeAliasMap.has(param)) {
        // 尝试转换别名类型为 Vue props 类型
        try {
          return typeScriptToVueProp(param)
        }
        catch (e) {
          return param
        }
      }
    }
    // 检查是否是嵌套泛型
    else if (/[A-Z][a-zA-Z0-9]*<.+>/.test(param)) {
      return processNestedGeneric(param, typeMap, typeAliasMap)
    }
    // 处理对象字面量
    else if (param.startsWith('{') && param.endsWith('}')) {
      try {
        const objProps = parseInlineProps(typeAliasMap, param.slice(1, -1).trim())
        return stringifyProps(objProps)
      }
      catch (e) {
        return param
      }
    }
    // 处理联合类型
    else if (param.includes('|')) {
      return handleUnionType(param)
    }
    // 处理交叉类型
    else if (param.includes('&')) {
      return handleIntersectionType(param)
    }

    return param
  }).join(', ')
}

/**
 * 处理嵌套泛型结构，如 Array<MyType> 或 Record<string, AnotherType>
 *
 * @param genericText 泛型类型文本
 * @param typeMap 类型映射
 * @param typeAliasMap 类型别名映射
 * @returns 处理后的类型表示
 */
export function processNestedGeneric(
  genericText: string,
  typeMap: Map<string, string>,
  typeAliasMap: Map<string, any>,
): string {
  // 解析泛型结构
  const match = genericText.match(/([A-Z][a-zA-Z0-9]*)(<.+>)/)
  if (!match)
    return genericText

  const [_, baseType, genericParams] = match

  // 处理常见的泛型容器类型
  switch (baseType.toLowerCase()) {
    case 'array':
    case 'set':
    case 'collection':
      return '{ type: Array, required: true }'

    case 'map':
    case 'record':
    case 'dictionary':
      return '{ type: Object, required: true }'

    case 'promise':
    case 'observable':
      // 提取并处理内部类型
      const innerType = genericParams.slice(1, -1).trim()
      const processedInner = processInnerGenericParams(innerType)

      // Promise通常解析为内部类型
      return processedInner || '{ type: Object, required: true }'

    default:
      // 对于自定义泛型类型，检查是否有类型映射
      if (typeMap.has(baseType)) {
        try {
          // 处理内部泛型参数
          const innerParams = genericParams.slice(1, -1).trim()
          const processedParams = processInnerGenericParams(innerParams)

          // 尝试合并基础类型与参数
          const typeInfo = typeMap.get(baseType) || ''

          // 如果基础类型是对象类型，尝试合并参数
          if (typeInfo.startsWith('{') && typeInfo.endsWith('}')) {
            // 这里需要一个复杂的合并逻辑，简化处理为对象类型
            return '{ type: Object, required: true }'
          }

          return typeInfo
        }
        catch (e) {
          return '{ type: Object, required: true }'
        }
      }
      // 默认处理为对象类型
      return '{ type: Object, required: true }'
  }
}

/**
 * 转换styled组件的通用函数
 *
 * @param ast AST对象
 * @param code 源代码
 * @param s MagicString实例，用于代码修改
 * @param offset 位置偏移量，用于Vue文件中脚本部分的偏移计算
 * @returns 是否有修改
 */
export function transformStyledComponents(
  ast: any,
  code: string,
  s: any, // MagicString
  offset: number = 0,
): { hasChanges: boolean, props?: string[] } {
  let hasChanges = false
  const props: string[] = []

  // 处理styled组件
  traverse(ast, {
    VariableDeclaration(path: any) {
      // 遍历所有声明
      for (const declaration of path.node.declarations) {
        // 查找初始化表达式
        const init = declaration.init
        if (init && t.isTaggedTemplateExpression(init)) {
          const tag = init.tag

          // 查找styled.tag<Props> 模式
          // 首先看是否是TypeCastExpression或TSAsExpression（泛型标记可能被解析为类型断言）
          if (tag && (t.isTSAsExpression(tag) || t.isTypeCastExpression(tag))) {
            const expression = tag.expression
            // 检查是否是成员表达式 styled.tag
            if (expression && t.isMemberExpression(expression)
              && t.isIdentifier(expression.object) && expression.object.name === 'styled'
              && t.isIdentifier(expression.property)) {
              // 获取HTML标签名称
              const tagName = expression.property.name

              // 获取类型参数（在TypeAnnotation或typeAnnotation中）
              const typeAnnotation = tag.typeAnnotation
              if (typeAnnotation) {
                // 获取类型在源码中的位置
                const typeStart = typeAnnotation.start || 0
                const typeEnd = typeAnnotation.end || 0

                // Skip if position information cannot be obtained
                if (typeStart === 0 || typeEnd === 0)
                  continue

                // Extract type text
                const typeText = code.slice(typeStart, typeEnd)

                // Process type text to extract actual parameters
                const params = processTypeParameters(
                  tag,
                  typeText,
                )

                if (!params)
                  continue

                // 查找成员表达式在源码中的位置
                const exprStart = expression.start || 0
                if (exprStart === 0)
                  continue

                // Replace styled.tag<Props> with styled('tag', Props)
                s.overwrite(
                  offset + exprStart,
                  offset + typeEnd,
                  `styled('${tagName}', ${params})`,
                )
                hasChanges = true
                props.push(params)
              }
            }
          }

          // 另一种可能：直接是成员表达式并且跟着TSTypeParameterInstantiation
          if (tag && t.isMemberExpression(tag)
            && t.isIdentifier(tag.object) && tag.object.name === 'styled'
            && t.isIdentifier(tag.property)) {
            // 查找泛型参数（可能在父节点或相邻节点）
            let typeParams: any = null
            let typeParamsStart = 0
            let typeParamsEnd = 0

            // 检查是否有typeParameters属性（Babel类型定义中可能缺少，但运行时可能存在）
            if ((tag as any).typeParameters) {
              typeParams = (tag as any).typeParameters
              typeParamsStart = typeParams.start || 0
              typeParamsEnd = typeParams.end || 0
            }

            // 如果没有找到类型参数，查找下一个可能的节点
            if (!typeParams && (init as any).typeParameters) {
              typeParams = (init as any).typeParameters
              typeParamsStart = typeParams.start || 0
              typeParamsEnd = typeParams.end || 0
            }

            if (typeParams && typeParamsStart > 0 && typeParamsEnd > 0) {
              // 获取HTML标签名称
              const tagName = tag.property.name

              // 提取泛型参数文本
              const genericParams = code.slice(typeParamsStart, typeParamsEnd)

              // 检查是否是有效的泛型参数
              if (genericParams.startsWith('<') && genericParams.endsWith('>')) {
                // 处理泛型参数
                const finalParams = processTypeParameters(
                  tag,
                  genericParams,
                )
                if (!finalParams)
                  continue

                // Replace styled.tag<Props> with styled('tag', Props)
                const nodeStart = tag.start || 0
                if (nodeStart === 0)
                  continue

                s.overwrite(
                  offset + nodeStart,
                  offset + typeParamsEnd,
                  `styled('${tagName}', ${finalParams})`,
                )
                props.push(finalParams)
                hasChanges = true
              }
            }
          }
        }
      }
    },
  })

  return { hasChanges, props }
}
