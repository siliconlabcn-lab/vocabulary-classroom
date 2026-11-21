import { getStore } from '@edgeone/pages-blob';
import { createClassroomApi } from '../../../server/classroom-api.js';

const store = getStore('classroom-private-v1');
const handle = createClassroomApi(store);
export const onRequest = context => handle(context);
