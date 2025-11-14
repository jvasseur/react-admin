import {
    InfiniteData,
    UseInfiniteQueryResult,
    useQueryClient,
} from '@tanstack/react-query';
import {
    GetListResult as OriginalGetListResult,
    MutationMode,
    RaRecord,
    GetInfiniteListResult,
} from '../types';

export const useUpdateCache = ({ type }: UseUpdateCacheOptions) => {
    const queryClient = useQueryClient();

    const updateCache = <RecordType extends RaRecord = any>(
        { resource, ...params },
        { mutationMode }: { mutationMode: MutationMode },
        result: RecordType | undefined
    ) => {
        // hack: only way to tell react-query not to fetch this query for the next 5 seconds
        // because setQueryData doesn't accept a stale time option
        const now = Date.now();
        const updatedAt = mutationMode === 'undoable' ? now + 5 * 1000 : now;

        switch (type) {
            case 'create': {
                const id =
                    mutationMode === 'pessimistic'
                        ? result?.id
                        : params.data?.id;
                if (!id) {
                    throw new Error(
                        'Invalid dataProvider response for create: missing id'
                    );
                }
                // Stringify and parse the data to remove undefined values.
                // If we don't do this, an update with { id: undefined } as payload
                // would remove the id from the record, which no real data provider does.
                const clonedData = JSON.parse(
                    JSON.stringify(
                        mutationMode === 'pessimistic' ? result : params.data
                    )
                );

                queryClient.setQueryData(
                    [resource, 'getOne', { id: String(id), meta: params.meta }],
                    (record: RecordType) => ({ ...record, ...clonedData }),
                    { updatedAt }
                );

                return clonedData;
            }
            case 'delete': {
                const updateColl = (old: RecordType[]) => {
                    if (!old) return old;
                    const index = old.findIndex(
                        // eslint-disable-next-line eqeqeq
                        record => record.id == params.id
                    );
                    if (index === -1) {
                        return old;
                    }
                    return [...old.slice(0, index), ...old.slice(index + 1)];
                };

                type GetListResult = Omit<OriginalGetListResult, 'data'> & {
                    data?: RecordType[];
                };

                queryClient.setQueriesData(
                    { queryKey: [resource, 'getList'] },
                    (res: GetListResult) => {
                        if (!res || !res.data) return res;
                        const newCollection = updateColl(res.data);
                        const recordWasFound =
                            newCollection.length < res.data.length;
                        return recordWasFound
                            ? {
                                  data: newCollection,
                                  total: res.total ? res.total - 1 : undefined,
                                  pageInfo: res.pageInfo,
                              }
                            : res;
                    },
                    { updatedAt }
                );
                queryClient.setQueriesData(
                    { queryKey: [resource, 'getInfiniteList'] },
                    (
                        res: UseInfiniteQueryResult<
                            InfiniteData<GetInfiniteListResult>
                        >['data']
                    ) => {
                        if (!res || !res.pages) return res;
                        return {
                            ...res,
                            pages: res.pages.map(page => {
                                const newCollection = updateColl(page.data);
                                const recordWasFound =
                                    newCollection.length < page.data.length;
                                return recordWasFound
                                    ? {
                                          ...page,
                                          data: newCollection,
                                          total: page.total
                                              ? page.total - 1
                                              : undefined,
                                          pageInfo: page.pageInfo,
                                      }
                                    : page;
                            }),
                        };
                    },
                    { updatedAt }
                );
                queryClient.setQueriesData(
                    { queryKey: [resource, 'getMany'] },
                    (coll: RecordType[]) =>
                        coll && coll.length > 0 ? updateColl(coll) : coll,
                    { updatedAt }
                );
                queryClient.setQueriesData(
                    { queryKey: [resource, 'getManyReference'] },
                    (res: GetListResult) => {
                        if (!res || !res.data) return res;
                        const newCollection = updateColl(res.data);
                        const recordWasFound =
                            newCollection.length < res.data.length;
                        return recordWasFound
                            ? {
                                  ...res,
                                  data: newCollection,
                                  total: res.total! - 1,
                              }
                            : res;
                    },
                    { updatedAt }
                );

                return params.previousData;
            }
            case 'update': {
                // Stringify and parse the data to remove undefined values.
                // If we don't do this, an update with { id: undefined } as payload
                // would remove the id from the record, which no real data provider does.
                const clonedData = JSON.parse(
                    JSON.stringify(
                        mutationMode === 'pessimistic' ? result : params?.data
                    )
                );

                const updateColl = (old: RecordType[]) => {
                    if (!old) return old;
                    const index = old.findIndex(
                        // eslint-disable-next-line eqeqeq
                        record => record.id == params?.id
                    );
                    if (index === -1) {
                        return old;
                    }
                    return [
                        ...old.slice(0, index),
                        { ...old[index], ...clonedData } as RecordType,
                        ...old.slice(index + 1),
                    ];
                };

                type GetListResult = Omit<OriginalGetListResult, 'data'> & {
                    data?: RecordType[];
                };

                const previousRecord = queryClient.getQueryData<RecordType>([
                    resource,
                    'getOne',
                    { id: String(params?.id), meta: params?.meta },
                ]);

                queryClient.setQueryData(
                    [
                        resource,
                        'getOne',
                        { id: String(params?.id), meta: params?.meta },
                    ],
                    (record: RecordType) => ({
                        ...record,
                        ...clonedData,
                    }),
                    { updatedAt }
                );
                queryClient.setQueriesData(
                    { queryKey: [resource, 'getList'] },
                    (res: GetListResult) =>
                        res && res.data
                            ? { ...res, data: updateColl(res.data) }
                            : res,
                    { updatedAt }
                );
                queryClient.setQueriesData(
                    { queryKey: [resource, 'getInfiniteList'] },
                    (
                        res: UseInfiniteQueryResult<
                            InfiniteData<GetInfiniteListResult>
                        >['data']
                    ) =>
                        res && res.pages
                            ? {
                                  ...res,
                                  pages: res.pages.map(page => ({
                                      ...page,
                                      data: updateColl(page.data),
                                  })),
                              }
                            : res,
                    { updatedAt }
                );
                queryClient.setQueriesData(
                    { queryKey: [resource, 'getMany'] },
                    (coll: RecordType[]) =>
                        coll && coll.length > 0 ? updateColl(coll) : coll,
                    { updatedAt }
                );
                queryClient.setQueriesData(
                    { queryKey: [resource, 'getManyReference'] },
                    (res: GetListResult) =>
                        res && res.data
                            ? { ...res, data: updateColl(res.data) }
                            : res,
                    { updatedAt }
                );

                const optimisticResult = {
                    ...previousRecord,
                    ...clonedData,
                };
                return optimisticResult;
            }
        }
    };

    return updateCache;
};

export type UseUpdateCacheOptions = {
    type: 'create' | 'delete' | 'update';
};
